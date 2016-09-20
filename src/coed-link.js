

module.exports = CoLink;

// tag: the tag name (the same name is used for pm or dom node, for the sake of simplicity)
// attrs: the attributes known by pm, with default values
// contents: the contents specs by name
// from: function(dom) -> props
// to: function(props) -> dom
// where props is an object with attributes and serialized contents




function CoLink(options) {
	this.tag = "co-link";
	this.name = "link";
	this.attrs = {
		id: "",
		type:  "none",
		url: "",
		description: "",
		icon: "",
		thumbnail: "",
		size: "",
		width: "",
		height: "",
		duration: "",
		site: "",
		html: ""
	};
	this.contents = {
		title: "inline<_>*",
		content: "inline<_>*"
	};
	this.handler = this.handler.bind(this);

	if (options.inspector) this.inspector = options.inspector;
}

CoLink.prototype.inspector = function(info, cb) {
	setTimeout(function() {
		info = Object.assign({}, info);
		info.type = 'link';
		cb(null, info);
	});
};

CoLink.prototype.ensure = function(parent, tag, atts) {
	var childs = parent.childNodes;
	var r = new RegExp("^" + tag + "$", "i");
	var node, child;
	for (var i=0; i < childs.length; i++) {
		child = childs[i];
		if (child.nodeType == Node.ELEMENT_NODE && r.test(child.nodeName)) {
			node = child;
			break;
		}
	}
	if (!node) {
		node = document.createElement(tag);
		parent.appendChild(node);
	}
	if (atts) Object.keys(atts).forEach(function(key) {
		node.setAttribute(key, atts[key]);
	});
	return node;
};

CoLink.prototype.fill = function(parent, props) {
	parent.innerHTML = "";
	Object.keys(props).forEach(function(name) {
		var val = props[name];
		parent.appendChild(val);
	});
};

CoLink.prototype.formatDimensions = function(w, h) {
	if (!w) return;
	if (!h) return w + 'px';
	return w + 'x' + h;
};

CoLink.prototype.parseDimensions = function(obj, dim) {
	if (!dim) return;
	if (/px$/.test(dim)) {
		obj.width = parseInt(dim);
	} else if (/^\d+x\d+$/.test(dim)) {
		dim = dim.split('x');
		obj.width = parseInt(dim[0]);
		obj.height = parseInt(dim[1]);
	}
};

CoLink.prototype.formatDuration = function(d) {
	return d;
};

CoLink.prototype.formatSize = function(s) {
	if (!s) return;
	return Math.round(s / 1000) + "KB";
};

CoLink.prototype.parseSize = function(obj, s) {
	if (!s) return;
	if (/^\d+KB$/.test(s)) obj.size = parseInt(s) * 1000;
};

CoLink.prototype.to = function(attrs) {
	var me = this;
	var node = document.createElement(me.tag);
	node.innerHTML = '<header><a name="type"></a><a title="" target="_blank"></a><a name="preview"></a></header><div>\
<div coed-name="title"></div><div coed-name="content"></div>\
</div><aside><div><div></div><p></p></div><figure></figure></aside><script type="text/html"></script>';
	var link = node.querySelector('header > a[title]');

	link.setAttribute("title", attrs.site || "");
	if (attrs.type) node.setAttribute("type", attrs.type);
	if (attrs.id) node.setAttribute("id", attrs.id);
	if (attrs.url) link.setAttribute("href", attrs.url);
	if (attrs.icon) me.ensure(link, 'img', { src: attrs.icon });
	if (attrs.thumbnail) me.ensure(node.querySelector('figure'), 'img', { src: attrs.thumbnail });
	if (attrs.html) me.ensure(node, 'script', {type: 'text/html'}).textContent = attrs.html || '';

	var obj = {
		dimensions: me.formatDimensions(attrs.width, attrs.height),
		duration: me.formatDuration(attrs.duration),
		size: me.formatSize(attrs.size)
	};
	Object.keys(obj).forEach(function(key) {
		var span = document.createElement('span');
		span.setAttribute('title', key);
		span.innerHTML = obj[key] || "";
		obj[key] = span;
	});
	node.querySelector('aside > div > p').innerHTML = attrs.description;

	me.fill(node.querySelector('aside > div > div'), obj);
	return node;
};

CoLink.prototype.from = function(node) {
	var me = this;
	var attrs = {};
	attrs.type = node.getAttribute('type') || 'none';
	attrs.id = node.getAttribute('id') || undefined;

	var link = node.querySelector("header > a[href]");
	if (link) {
		attrs.url = link.getAttribute('href');
		attrs.site = link.getAttribute('title');
		var icon = link.querySelector("img");
		if (icon) attrs.icon = icon.getAttribute('src');
	}
	var html = node.querySelector('script[type="text/html"]');
	if (html) attrs.html = html.textContent;
	var thumb = node.querySelector('aside > figure > img');
	if (thumb) {
		attrs.thumbnail = thumb.getAttribute('src');
	}
	var i;
	var asides = node.querySelectorAll('aside > div > span');
	var aside, title, val;
	for (i=0; i < asides.length; i++) {
		aside = asides.item(i);
		title = aside.getAttribute('title');
		val = aside.innerHTML;
		if (title == 'size') me.parseSize(attrs, val);
		else if (title == 'dimensions') me.parseDimensions(attrs, val);
		else attrs[title] = val;
	}
	var description = node.querySelector('aside > div > p');
	if (description) attrs.description = description.innerHTML;
	return attrs;
};

CoLink.prototype.handler = function(pm, info) {
	var me = this;

	var loadingId = 'id-colink-' + Date.now();

	if (!info.title) {
		if (info.url) info.title = info.url;
		else if (info.fragment) info.title = info.fragment.firstChild.innerText;
	}

	function parseDom(node) {
		var div = document.createElement("div");
		div.appendChild(node);
		var newNode = pm.schema.parseDOM(div);
		return newNode.firstChild;
	}

	me.inspector(info, function(err, props) {
		var oldnode = document.getElementById(loadingId);
		if (!oldnode) {
			return;
		}
		var pos = pm.posFromDOM(oldnode);
		var begin = pos.pos;
		var $pos = pm.doc.resolve(begin);
		var end = begin + $pos.nodeAfter.nodeSize;

		if (err) {
			console.error(err);
			pm.tr.delete(begin, end).apply();
			return;
		}
		var dom = me.to(props);
		dom.querySelector('[coed-name="title"]').innerHTML = props.title;

		pm.tr.replaceWith(begin, end, parseDom(dom)).apply();
	});

	var loadingNode = me.to({
		type: "none",
		id: loadingId
	}, {
		title: info.title
	});

	return parseDom(loadingNode);
}
