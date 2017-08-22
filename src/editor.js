var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var View = require("prosemirror-view");
var Model = require("prosemirror-model");
var Input = require("prosemirror-inputrules");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var DropCursor = require("@kapouer/prosemirror-dropcursor").dropCursor;
var History = require("prosemirror-history");

var baseSchema = require("prosemirror-schema-basic").schema;
var listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");

var UrlRegex = require('url-regex');

var FocusPlugin = require("./focus-plugin");
var KeymapPlugin = require("./keymap-plugin");

var Utils = require("./utils");
var Specs = require("./specs");

var Viewer = global.Pagecut && global.Pagecut.Viewer || require("./viewer");

Editor.prototype = Object.create(View.EditorView.prototype);
Object.assign(Editor.prototype, Viewer.prototype);

Editor.defaults = {};
Editor.defaults.nodes = baseSchema.spec.nodes.remove('image');
Editor.defaults.nodes = listSchema.addListNodes(
	Editor.defaults.nodes,
	"paragraph block*",
	"block"
);
// Editor.defaults.nodes = tableSchema.addTableNodes(
// 	Editor.defaults.nodes, "inline<_>*", "block"
// );

Editor.defaults.marks = baseSchema.spec.marks;


Editor.defaults.mapKeys = {
	// 'Shift-Mod-z': History.redo
};

module.exports = {
	Editor: Editor,
	View: View,
	Model: Model,
	State: State,
	Setup: Setup,
	Transform: Transform,
	Commands: Commands,
	keymap: keymap,
	Viewer: Viewer,
	modules: global.Pagecut && global.Pagecut.modules || {}
};

function Editor(opts) {
	var editor = this;

	this.utils = new Utils(this);

	opts = Object.assign({
		plugins: []
	}, Editor.defaults, opts);

	Viewer.call(this, opts);

	var spec = {
		nodes: opts.nodes,
		marks: opts.marks,
		topNode: opts.topNode
	};
	var views = {};

	for (var i=this.elements.length - 1; i >= 0; i--) {
		Specs.define(editor, this.elements[i], spec, views);
	}

	this.schema = new Model.Schema(spec);

	this.serializer = Model.DOMSerializer.fromSchema(this.schema);
	this.parser = Model.DOMParser.fromSchema(this.schema);

	var cbSerializer = Model.DOMSerializer.fromSchema(this.schema);
	function replaceOutputSpec(fun) {
		return function(node) {
			var out = fun(node);
			Object.assign(out[1], {
				'block-data': node.attrs.block_data
			});
			return out;
		};
	}
	Object.keys(cbSerializer.nodes).forEach(function(name) {
		if (spec.nodes.get(name).typeName != "root") return;
		cbSerializer.nodes[name] = replaceOutputSpec(cbSerializer.nodes[name]);
	});
	Object.keys(cbSerializer.marks).forEach(function(name) {
		if (spec.marks.get(name).typeName != "root") return;
		cbSerializer.marks[name] = replaceOutputSpec(cbSerializer.marks[name]);
	});

	this.plugins.push(
		KeymapPlugin,
		FocusPlugin,
//		require("./test-plugin"),
//		CreatePasteBlock,
	function(editor) {
		return Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(editor.schema))
		});
	}, function(editor, opts) {
		return keymap(Setup.buildKeymap(editor.schema, opts.mapKeys));
	}, function(editor) {
		return keymap(Commands.baseKeymap);
	}, function() {
		return History.history({
			preserveItems: true // or else cancel does not keep selected node
		});
	}, function(editor, opts) {
		return DropCursor({
			decorate: function($pos) {
				var node = editor.root.createElement("span");
				node.textContent = "\u200b";
				node.style.cssText = "margin-left:-1px; margin-right:-1px; border-left:2px solid black; display: inline-block; pointer-events: none";
				return View.Decoration.widget($pos.pos, node);
			}
		});
	});

	var plugins = opts.plugins.map(function(plugin) {
		if (plugin instanceof State.Plugin) return plugin;
		if (typeof plugin == "function") {
			plugin = plugin(editor, opts);
		}
		if (plugin instanceof State.Plugin) return plugin;
		if (plugin.update || plugin.destroy) {
			var obj = plugin;
			plugin = {view: function() {
				return this;
			}.bind(plugin)};
		}
		if (plugin.key && typeof plugin.key == "string") plugin.key = new State.PluginKey(plugin.key);
		return new State.Plugin(plugin);
	});

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	View.EditorView.call(this, {mount: place}, {
		state: State.EditorState.create({
			schema: this.schema,
			plugins: plugins,
			doc: opts.content ? this.parser.parse(opts.content) : undefined
		}),
		domParser: this.parser,
		clipboardSerializer: cbSerializer,
		dispatchTransaction: function(tr) {
			editor.updateState(editor.state.apply(tr));
		},
		nodeViews: views
	});

	var rootId = this.dom.getAttribute('block-id');
	if (rootId) {
		this.state.doc.attrs.block_id = rootId;
	}
	var rootType = this.dom.getAttribute('block-type');
	if (rootType) {
		this.state.doc.attrs.block_type = rootType;
	}
}

Object.assign(Editor.prototype, Viewer.prototype, View.EditorView);


Editor.prototype.getPlugin = function(key) {
	return new State.PluginKey(key).get(this.state);
};



function CreatePasteBlock(editor) {
	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				var frag = editor.utils.fragmentApply(pslice.content, editor.pasteNode.bind(editor));
				return new Model.Slice(frag, pslice.openStart, pslice.openEnd);
			}
		}
	});
}

function getIdBlockNode(node) {
	var id = node.attrs.block_id;
	if (id == null && node.marks.length > 0) {
		node = node.marks[0];
		id = node.attrs.block_id;
	}
	return {id: id, node: node};
}

Editor.prototype.pasteNode = function(node) {
	var bn = getIdBlockNode(node);
	if (bn.id == null) {
		// a block node must have an id, so it is not one
		return;
	}
	var block = this.blocks.get(bn.id);
	if (!block) {
		// unknown block, let id module deserialize it later
		delete bn.node.attrs.block_id;
		return;
	}
	if (!block.deleted) {
		// known block already exists, assume copy/paste
		block = this.blocks.copy(block);
		block.id = bn.node.attrs.block_id = this.blocks.genId();
		this.blocks.set(block);
	} else {
		// known block is not in dom, assume cut/paste or drag/drop
		delete block.deleted; // just in case
	}
};

