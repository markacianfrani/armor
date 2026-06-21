// ../2026-03-15-pi-ui/node_modules/@lit/reactive-element/development/css-tag.js
var NODE_MODE = false;
var global = globalThis;
var supportsAdoptingStyleSheets =
  global.ShadowRoot &&
  (global.ShadyCSS === undefined || global.ShadyCSS.nativeShadow) &&
  "adoptedStyleSheets" in Document.prototype &&
  "replace" in CSSStyleSheet.prototype;
var constructionToken = Symbol();
var cssTagCache = new WeakMap();

class CSSResult {
  constructor(cssText, strings, safeToken) {
    this["_$cssResult$"] = true;
    if (safeToken !== constructionToken) {
      throw new Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    }
    this.cssText = cssText;
    this._strings = strings;
  }
  get styleSheet() {
    let styleSheet = this._styleSheet;
    const strings = this._strings;
    if (supportsAdoptingStyleSheets && styleSheet === undefined) {
      const cacheable = strings !== undefined && strings.length === 1;
      if (cacheable) {
        styleSheet = cssTagCache.get(strings);
      }
      if (styleSheet === undefined) {
        (this._styleSheet = styleSheet = new CSSStyleSheet()).replaceSync(this.cssText);
        if (cacheable) {
          cssTagCache.set(strings, styleSheet);
        }
      }
    }
    return styleSheet;
  }
  toString() {
    return this.cssText;
  }
}
var textFromCSSResult = (value) => {
  if (value["_$cssResult$"] === true) {
    return value.cssText;
  } else if (typeof value === "number") {
    return value;
  } else {
    throw new Error(
      `Value passed to 'css' function must be a 'css' function result: ` +
        `${value}. Use 'unsafeCSS' to pass non-literal values, but take care ` +
        `to ensure page security.`,
    );
  }
};
var unsafeCSS = (value) =>
  new CSSResult(typeof value === "string" ? value : String(value), undefined, constructionToken);
var css = (strings, ...values) => {
  const cssText =
    strings.length === 1
      ? strings[0]
      : values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
  return new CSSResult(cssText, strings, constructionToken);
};
var adoptStyles = (renderRoot, styles) => {
  if (supportsAdoptingStyleSheets) {
    renderRoot.adoptedStyleSheets = styles.map((s) =>
      s instanceof CSSStyleSheet ? s : s.styleSheet,
    );
  } else {
    for (const s of styles) {
      const style = document.createElement("style");
      const nonce = global["litNonce"];
      if (nonce !== undefined) {
        style.setAttribute("nonce", nonce);
      }
      style.textContent = s.cssText;
      renderRoot.appendChild(style);
    }
  }
};
var cssResultFromStyleSheet = (sheet) => {
  let cssText = "";
  for (const rule of sheet.cssRules) {
    cssText += rule.cssText;
  }
  return unsafeCSS(cssText);
};
var getCompatibleStyle =
  supportsAdoptingStyleSheets || (NODE_MODE && global.CSSStyleSheet === undefined)
    ? (s) => s
    : (s) => (s instanceof CSSStyleSheet ? cssResultFromStyleSheet(s) : s);

// ../2026-03-15-pi-ui/node_modules/@lit/reactive-element/development/reactive-element.js
var {
  is,
  defineProperty,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
  getOwnPropertySymbols,
  getPrototypeOf,
} = Object;
var NODE_MODE2 = false;
var global2 = globalThis;
if (NODE_MODE2) {
  global2.customElements ??= customElements;
}
var DEV_MODE = true;
var issueWarning;
var trustedTypes = global2.trustedTypes;
var emptyStringForBooleanAttribute = trustedTypes ? trustedTypes.emptyScript : "";
var polyfillSupport = DEV_MODE
  ? global2.reactiveElementPolyfillSupportDevMode
  : global2.reactiveElementPolyfillSupport;
if (DEV_MODE) {
  global2.litIssuedWarnings ??= new Set();
  issueWarning = (code, warning) => {
    warning += ` See https://lit.dev/msg/${code} for more information.`;
    if (!global2.litIssuedWarnings.has(warning) && !global2.litIssuedWarnings.has(code)) {
      console.warn(warning);
      global2.litIssuedWarnings.add(warning);
    }
  };
  queueMicrotask(() => {
    issueWarning("dev-mode", `Lit is in dev mode. Not recommended for production!`);
    if (global2.ShadyDOM?.inUse && polyfillSupport === undefined) {
      issueWarning(
        "polyfill-support-missing",
        `Shadow DOM is being polyfilled via \`ShadyDOM\` but ` +
          `the \`polyfill-support\` module has not been loaded.`,
      );
    }
  });
}
var debugLogEvent = DEV_MODE
  ? (event) => {
      const shouldEmit = global2.emitLitDebugLogEvents;
      if (!shouldEmit) {
        return;
      }
      global2.dispatchEvent(
        new CustomEvent("lit-debug", {
          detail: event,
        }),
      );
    }
  : undefined;
var JSCompiler_renameProperty = (prop, _obj) => prop;
var defaultConverter = {
  toAttribute(value, type) {
    switch (type) {
      case Boolean:
        value = value ? emptyStringForBooleanAttribute : null;
        break;
      case Object:
      case Array:
        value = value == null ? value : JSON.stringify(value);
        break;
    }
    return value;
  },
  fromAttribute(value, type) {
    let fromValue = value;
    switch (type) {
      case Boolean:
        fromValue = value !== null;
        break;
      case Number:
        fromValue = value === null ? null : Number(value);
        break;
      case Object:
      case Array:
        try {
          fromValue = JSON.parse(value);
        } catch (e) {
          fromValue = null;
        }
        break;
    }
    return fromValue;
  },
};
var notEqual = (value, old) => !is(value, old);
var defaultPropertyDeclaration = {
  attribute: true,
  type: String,
  converter: defaultConverter,
  reflect: false,
  useDefault: false,
  hasChanged: notEqual,
};
Symbol.metadata ??= Symbol("metadata");
global2.litPropertyMetadata ??= new WeakMap();

class ReactiveElement extends HTMLElement {
  static addInitializer(initializer) {
    this.__prepare();
    (this._initializers ??= []).push(initializer);
  }
  static get observedAttributes() {
    this.finalize();
    return this.__attributeToPropertyMap && [...this.__attributeToPropertyMap.keys()];
  }
  static createProperty(name, options = defaultPropertyDeclaration) {
    if (options.state) {
      options.attribute = false;
    }
    this.__prepare();
    if (this.prototype.hasOwnProperty(name)) {
      options = Object.create(options);
      options.wrapped = true;
    }
    this.elementProperties.set(name, options);
    if (!options.noAccessor) {
      const key = DEV_MODE ? Symbol.for(`${String(name)} (@property() cache)`) : Symbol();
      const descriptor = this.getPropertyDescriptor(name, key, options);
      if (descriptor !== undefined) {
        defineProperty(this.prototype, name, descriptor);
      }
    }
  }
  static getPropertyDescriptor(name, key, options) {
    const { get, set } = getOwnPropertyDescriptor(this.prototype, name) ?? {
      get() {
        return this[key];
      },
      set(v) {
        this[key] = v;
      },
    };
    if (DEV_MODE && get == null) {
      if ("value" in (getOwnPropertyDescriptor(this.prototype, name) ?? {})) {
        throw new Error(
          `Field ${JSON.stringify(String(name))} on ` +
            `${this.name} was declared as a reactive property ` +
            `but it's actually declared as a value on the prototype. ` +
            `Usually this is due to using @property or @state on a method.`,
        );
      }
      issueWarning(
        "reactive-property-without-getter",
        `Field ${JSON.stringify(String(name))} on ` +
          `${this.name} was declared as a reactive property ` +
          `but it does not have a getter. This will be an error in a ` +
          `future version of Lit.`,
      );
    }
    return {
      get,
      set(value) {
        const oldValue = get?.call(this);
        set?.call(this, value);
        this.requestUpdate(name, oldValue, options);
      },
      configurable: true,
      enumerable: true,
    };
  }
  static getPropertyOptions(name) {
    return this.elementProperties.get(name) ?? defaultPropertyDeclaration;
  }
  static __prepare() {
    if (this.hasOwnProperty(JSCompiler_renameProperty("elementProperties", this))) {
      return;
    }
    const superCtor = getPrototypeOf(this);
    superCtor.finalize();
    if (superCtor._initializers !== undefined) {
      this._initializers = [...superCtor._initializers];
    }
    this.elementProperties = new Map(superCtor.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(JSCompiler_renameProperty("finalized", this))) {
      return;
    }
    this.finalized = true;
    this.__prepare();
    if (this.hasOwnProperty(JSCompiler_renameProperty("properties", this))) {
      const props = this.properties;
      const propKeys = [...getOwnPropertyNames(props), ...getOwnPropertySymbols(props)];
      for (const p of propKeys) {
        this.createProperty(p, props[p]);
      }
    }
    const metadata = this[Symbol.metadata];
    if (metadata !== null) {
      const properties = litPropertyMetadata.get(metadata);
      if (properties !== undefined) {
        for (const [p, options] of properties) {
          this.elementProperties.set(p, options);
        }
      }
    }
    this.__attributeToPropertyMap = new Map();
    for (const [p, options] of this.elementProperties) {
      const attr = this.__attributeNameForProperty(p, options);
      if (attr !== undefined) {
        this.__attributeToPropertyMap.set(attr, p);
      }
    }
    this.elementStyles = this.finalizeStyles(this.styles);
    if (DEV_MODE) {
      if (this.hasOwnProperty("createProperty")) {
        issueWarning(
          "no-override-create-property",
          "Overriding ReactiveElement.createProperty() is deprecated. " +
            "The override will not be called with standard decorators",
        );
      }
      if (this.hasOwnProperty("getPropertyDescriptor")) {
        issueWarning(
          "no-override-get-property-descriptor",
          "Overriding ReactiveElement.getPropertyDescriptor() is deprecated. " +
            "The override will not be called with standard decorators",
        );
      }
    }
  }
  static finalizeStyles(styles) {
    const elementStyles = [];
    if (Array.isArray(styles)) {
      const set = new Set(styles.flat(Infinity).reverse());
      for (const s of set) {
        elementStyles.unshift(getCompatibleStyle(s));
      }
    } else if (styles !== undefined) {
      elementStyles.push(getCompatibleStyle(styles));
    }
    return elementStyles;
  }
  static __attributeNameForProperty(name, options) {
    const attribute = options.attribute;
    return attribute === false
      ? undefined
      : typeof attribute === "string"
        ? attribute
        : typeof name === "string"
          ? name.toLowerCase()
          : undefined;
  }
  constructor() {
    super();
    this.__instanceProperties = undefined;
    this.isUpdatePending = false;
    this.hasUpdated = false;
    this.__reflectingProperty = null;
    this.__initialize();
  }
  __initialize() {
    this.__updatePromise = new Promise((res) => (this.enableUpdating = res));
    this._$changedProperties = new Map();
    this.__saveInstanceProperties();
    this.requestUpdate();
    this.constructor._initializers?.forEach((i) => i(this));
  }
  addController(controller) {
    (this.__controllers ??= new Set()).add(controller);
    if (this.renderRoot !== undefined && this.isConnected) {
      controller.hostConnected?.();
    }
  }
  removeController(controller) {
    this.__controllers?.delete(controller);
  }
  __saveInstanceProperties() {
    const instanceProperties = new Map();
    const elementProperties = this.constructor.elementProperties;
    for (const p of elementProperties.keys()) {
      if (this.hasOwnProperty(p)) {
        instanceProperties.set(p, this[p]);
        delete this[p];
      }
    }
    if (instanceProperties.size > 0) {
      this.__instanceProperties = instanceProperties;
    }
  }
  createRenderRoot() {
    const renderRoot = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    adoptStyles(renderRoot, this.constructor.elementStyles);
    return renderRoot;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot();
    this.enableUpdating(true);
    this.__controllers?.forEach((c) => c.hostConnected?.());
  }
  enableUpdating(_requestedUpdate) {}
  disconnectedCallback() {
    this.__controllers?.forEach((c) => c.hostDisconnected?.());
  }
  attributeChangedCallback(name, _old, value) {
    this._$attributeToProperty(name, value);
  }
  __propertyToAttribute(name, value) {
    const elemProperties = this.constructor.elementProperties;
    const options = elemProperties.get(name);
    const attr = this.constructor.__attributeNameForProperty(name, options);
    if (attr !== undefined && options.reflect === true) {
      const converter =
        options.converter?.toAttribute !== undefined ? options.converter : defaultConverter;
      const attrValue = converter.toAttribute(value, options.type);
      if (
        DEV_MODE &&
        this.constructor.enabledWarnings.includes("migration") &&
        attrValue === undefined
      ) {
        issueWarning(
          "undefined-attribute-value",
          `The attribute value for the ${name} property is ` +
            `undefined on element ${this.localName}. The attribute will be ` +
            `removed, but in the previous version of \`ReactiveElement\`, ` +
            `the attribute would not have changed.`,
        );
      }
      this.__reflectingProperty = name;
      if (attrValue == null) {
        this.removeAttribute(attr);
      } else {
        this.setAttribute(attr, attrValue);
      }
      this.__reflectingProperty = null;
    }
  }
  _$attributeToProperty(name, value) {
    const ctor = this.constructor;
    const propName = ctor.__attributeToPropertyMap.get(name);
    if (propName !== undefined && this.__reflectingProperty !== propName) {
      const options = ctor.getPropertyOptions(propName);
      const converter =
        typeof options.converter === "function"
          ? { fromAttribute: options.converter }
          : options.converter?.fromAttribute !== undefined
            ? options.converter
            : defaultConverter;
      this.__reflectingProperty = propName;
      const convertedValue = converter.fromAttribute(value, options.type);
      this[propName] = convertedValue ?? this.__defaultValues?.get(propName) ?? convertedValue;
      this.__reflectingProperty = null;
    }
  }
  requestUpdate(name, oldValue, options, useNewValue = false, newValue) {
    if (name !== undefined) {
      if (DEV_MODE && name instanceof Event) {
        issueWarning(
          ``,
          `The requestUpdate() method was called with an Event as the property name. This is probably a mistake caused by binding this.requestUpdate as an event listener. Instead bind a function that will call it with no arguments: () => this.requestUpdate()`,
        );
      }
      const ctor = this.constructor;
      if (useNewValue === false) {
        newValue = this[name];
      }
      options ??= ctor.getPropertyOptions(name);
      const changed =
        (options.hasChanged ?? notEqual)(newValue, oldValue) ||
        (options.useDefault &&
          options.reflect &&
          newValue === this.__defaultValues?.get(name) &&
          !this.hasAttribute(ctor.__attributeNameForProperty(name, options)));
      if (changed) {
        this._$changeProperty(name, oldValue, options);
      } else {
        return;
      }
    }
    if (this.isUpdatePending === false) {
      this.__updatePromise = this.__enqueueUpdate();
    }
  }
  _$changeProperty(name, oldValue, { useDefault, reflect, wrapped }, initializeValue) {
    if (useDefault && !(this.__defaultValues ??= new Map()).has(name)) {
      this.__defaultValues.set(name, initializeValue ?? oldValue ?? this[name]);
      if (wrapped !== true || initializeValue !== undefined) {
        return;
      }
    }
    if (!this._$changedProperties.has(name)) {
      if (!this.hasUpdated && !useDefault) {
        oldValue = undefined;
      }
      this._$changedProperties.set(name, oldValue);
    }
    if (reflect === true && this.__reflectingProperty !== name) {
      (this.__reflectingProperties ??= new Set()).add(name);
    }
  }
  async __enqueueUpdate() {
    this.isUpdatePending = true;
    try {
      await this.__updatePromise;
    } catch (e) {
      Promise.reject(e);
    }
    const result = this.scheduleUpdate();
    if (result != null) {
      await result;
    }
    return !this.isUpdatePending;
  }
  scheduleUpdate() {
    const result = this.performUpdate();
    if (
      DEV_MODE &&
      this.constructor.enabledWarnings.includes("async-perform-update") &&
      typeof result?.then === "function"
    ) {
      issueWarning(
        "async-perform-update",
        `Element ${this.localName} returned a Promise from performUpdate(). ` +
          `This behavior is deprecated and will be removed in a future ` +
          `version of ReactiveElement.`,
      );
    }
    return result;
  }
  performUpdate() {
    if (!this.isUpdatePending) {
      return;
    }
    debugLogEvent?.({ kind: "update" });
    if (!this.hasUpdated) {
      this.renderRoot ??= this.createRenderRoot();
      if (DEV_MODE) {
        const ctor = this.constructor;
        const shadowedProperties = [...ctor.elementProperties.keys()].filter(
          (p) => this.hasOwnProperty(p) && p in getPrototypeOf(this),
        );
        if (shadowedProperties.length) {
          throw new Error(
            `The following properties on element ${this.localName} will not ` +
              `trigger updates as expected because they are set using class ` +
              `fields: ${shadowedProperties.join(", ")}. ` +
              `Native class fields and some compiled output will overwrite ` +
              `accessors used for detecting changes. See ` +
              `https://lit.dev/msg/class-field-shadowing ` +
              `for more information.`,
          );
        }
      }
      if (this.__instanceProperties) {
        for (const [p, value] of this.__instanceProperties) {
          this[p] = value;
        }
        this.__instanceProperties = undefined;
      }
      const elementProperties = this.constructor.elementProperties;
      if (elementProperties.size > 0) {
        for (const [p, options] of elementProperties) {
          const { wrapped } = options;
          const value = this[p];
          if (wrapped === true && !this._$changedProperties.has(p) && value !== undefined) {
            this._$changeProperty(p, undefined, options, value);
          }
        }
      }
    }
    let shouldUpdate = false;
    const changedProperties = this._$changedProperties;
    try {
      shouldUpdate = this.shouldUpdate(changedProperties);
      if (shouldUpdate) {
        this.willUpdate(changedProperties);
        this.__controllers?.forEach((c) => c.hostUpdate?.());
        this.update(changedProperties);
      } else {
        this.__markUpdated();
      }
    } catch (e) {
      shouldUpdate = false;
      this.__markUpdated();
      throw e;
    }
    if (shouldUpdate) {
      this._$didUpdate(changedProperties);
    }
  }
  willUpdate(_changedProperties) {}
  _$didUpdate(changedProperties) {
    this.__controllers?.forEach((c) => c.hostUpdated?.());
    if (!this.hasUpdated) {
      this.hasUpdated = true;
      this.firstUpdated(changedProperties);
    }
    this.updated(changedProperties);
    if (
      DEV_MODE &&
      this.isUpdatePending &&
      this.constructor.enabledWarnings.includes("change-in-update")
    ) {
      issueWarning(
        "change-in-update",
        `Element ${this.localName} scheduled an update ` +
          `(generally because a property was set) ` +
          `after an update completed, causing a new update to be scheduled. ` +
          `This is inefficient and should be avoided unless the next update ` +
          `can only be scheduled as a side effect of the previous update.`,
      );
    }
  }
  __markUpdated() {
    this._$changedProperties = new Map();
    this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this.__updatePromise;
  }
  shouldUpdate(_changedProperties) {
    return true;
  }
  update(_changedProperties) {
    this.__reflectingProperties &&= this.__reflectingProperties.forEach((p) =>
      this.__propertyToAttribute(p, this[p]),
    );
    this.__markUpdated();
  }
  updated(_changedProperties) {}
  firstUpdated(_changedProperties) {}
}
ReactiveElement.elementStyles = [];
ReactiveElement.shadowRootOptions = { mode: "open" };
ReactiveElement[JSCompiler_renameProperty("elementProperties", ReactiveElement)] = new Map();
ReactiveElement[JSCompiler_renameProperty("finalized", ReactiveElement)] = new Map();
polyfillSupport?.({ ReactiveElement });
if (DEV_MODE) {
  ReactiveElement.enabledWarnings = ["change-in-update", "async-perform-update"];
  const ensureOwnWarnings = function (ctor) {
    if (!ctor.hasOwnProperty(JSCompiler_renameProperty("enabledWarnings", ctor))) {
      ctor.enabledWarnings = ctor.enabledWarnings.slice();
    }
  };
  ReactiveElement.enableWarning = function (warning) {
    ensureOwnWarnings(this);
    if (!this.enabledWarnings.includes(warning)) {
      this.enabledWarnings.push(warning);
    }
  };
  ReactiveElement.disableWarning = function (warning) {
    ensureOwnWarnings(this);
    const i = this.enabledWarnings.indexOf(warning);
    if (i >= 0) {
      this.enabledWarnings.splice(i, 1);
    }
  };
}
(global2.reactiveElementVersions ??= []).push("2.1.2");
if (DEV_MODE && global2.reactiveElementVersions.length > 1) {
  queueMicrotask(() => {
    issueWarning(
      "multiple-versions",
      `Multiple versions of Lit loaded. Loading multiple versions ` + `is not recommended.`,
    );
  });
}

// ../2026-03-15-pi-ui/node_modules/lit-html/development/lit-html.js
var DEV_MODE2 = true;
var ENABLE_EXTRA_SECURITY_HOOKS = true;
var ENABLE_SHADYDOM_NOPATCH = true;
var NODE_MODE3 = false;
var global3 = globalThis;
var debugLogEvent2 = DEV_MODE2
  ? (event) => {
      const shouldEmit = global3.emitLitDebugLogEvents;
      if (!shouldEmit) {
        return;
      }
      global3.dispatchEvent(
        new CustomEvent("lit-debug", {
          detail: event,
        }),
      );
    }
  : undefined;
var debugLogRenderId = 0;
var issueWarning2;
if (DEV_MODE2) {
  global3.litIssuedWarnings ??= new Set();
  issueWarning2 = (code, warning) => {
    warning += code ? ` See https://lit.dev/msg/${code} for more information.` : "";
    if (!global3.litIssuedWarnings.has(warning) && !global3.litIssuedWarnings.has(code)) {
      console.warn(warning);
      global3.litIssuedWarnings.add(warning);
    }
  };
  queueMicrotask(() => {
    issueWarning2("dev-mode", `Lit is in dev mode. Not recommended for production!`);
  });
}
var wrap =
  ENABLE_SHADYDOM_NOPATCH && global3.ShadyDOM?.inUse && global3.ShadyDOM?.noPatch === true
    ? global3.ShadyDOM.wrap
    : (node) => node;
var trustedTypes2 = global3.trustedTypes;
var policy = trustedTypes2
  ? trustedTypes2.createPolicy("lit-html", {
      createHTML: (s) => s,
    })
  : undefined;
var identityFunction = (value) => value;
var noopSanitizer = (_node, _name, _type) => identityFunction;
var setSanitizer = (newSanitizer) => {
  if (!ENABLE_EXTRA_SECURITY_HOOKS) {
    return;
  }
  if (sanitizerFactoryInternal !== noopSanitizer) {
    throw new Error(
      `Attempted to overwrite existing lit-html security policy.` +
        ` setSanitizeDOMValueFactory should be called at most once.`,
    );
  }
  sanitizerFactoryInternal = newSanitizer;
};
var _testOnlyClearSanitizerFactoryDoNotCallOrElse = () => {
  sanitizerFactoryInternal = noopSanitizer;
};
var createSanitizer = (node, name, type) => {
  return sanitizerFactoryInternal(node, name, type);
};
var boundAttributeSuffix = "$lit$";
var marker = `lit$${Math.random().toFixed(9).slice(2)}$`;
var markerMatch = "?" + marker;
var nodeMarker = `<${markerMatch}>`;
var d =
  NODE_MODE3 && global3.document === undefined
    ? {
        createTreeWalker() {
          return {};
        },
      }
    : document;
var createMarker = () => d.createComment("");
var isPrimitive = (value) =>
  value === null || (typeof value != "object" && typeof value != "function");
var isArray = Array.isArray;
var isIterable = (value) => isArray(value) || typeof value?.[Symbol.iterator] === "function";
var SPACE_CHAR = `[ 	
\f\r]`;
var ATTR_VALUE_CHAR = `[^ 	
\f\r"'\`<>=]`;
var NAME_CHAR = `[^\\s"'>=/]`;
var textEndRegex = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var COMMENT_START = 1;
var TAG_NAME = 2;
var DYNAMIC_TAG_NAME = 3;
var commentEndRegex = /-->/g;
var comment2EndRegex = />/g;
var tagEndRegex = new RegExp(
  `>|${SPACE_CHAR}(?:(${NAME_CHAR}+)(${SPACE_CHAR}*=${SPACE_CHAR}*(?:${ATTR_VALUE_CHAR}|("|')|))|$)`,
  "g",
);
var ENTIRE_MATCH = 0;
var ATTRIBUTE_NAME = 1;
var SPACES_AND_EQUALS = 2;
var QUOTE_CHAR = 3;
var singleQuoteAttrEndRegex = /'/g;
var doubleQuoteAttrEndRegex = /"/g;
var rawTextElement = /^(?:script|style|textarea|title)$/i;
var HTML_RESULT = 1;
var SVG_RESULT = 2;
var MATHML_RESULT = 3;
var ATTRIBUTE_PART = 1;
var CHILD_PART = 2;
var PROPERTY_PART = 3;
var BOOLEAN_ATTRIBUTE_PART = 4;
var EVENT_PART = 5;
var ELEMENT_PART = 6;
var COMMENT_PART = 7;
var tag =
  (type) =>
  (strings, ...values) => {
    if (DEV_MODE2 && strings.some((s) => s === undefined)) {
      console.warn(
        `Some template strings are undefined.
` + "This is probably caused by illegal octal escape sequences.",
      );
    }
    if (DEV_MODE2) {
      if (values.some((val) => val?.["_$litStatic$"])) {
        issueWarning2(
          "",
          `Static values 'literal' or 'unsafeStatic' cannot be used as values to non-static templates.
` +
            `Please use the static 'html' tag function. See https://lit.dev/docs/templates/expressions/#static-expressions`,
        );
      }
    }
    return {
      ["_$litType$"]: type,
      strings,
      values,
    };
  };
var html = tag(HTML_RESULT);
var svg = tag(SVG_RESULT);
var mathml = tag(MATHML_RESULT);
var noChange = Symbol.for("lit-noChange");
var nothing = Symbol.for("lit-nothing");
var templateCache = new WeakMap();
var walker = d.createTreeWalker(d, 129);
var sanitizerFactoryInternal = noopSanitizer;
function trustFromTemplateString(tsa, stringFromTSA) {
  if (!isArray(tsa) || !tsa.hasOwnProperty("raw")) {
    let message = "invalid template strings array";
    if (DEV_MODE2) {
      message = `
          Internal Error: expected template strings to be an array
          with a 'raw' field. Faking a template strings array by
          calling html or svg like an ordinary function is effectively
          the same as calling unsafeHtml and can lead to major security
          issues, e.g. opening your code up to XSS attacks.
          If you're using the html or svg tagged template functions normally
          and still seeing this error, please file a bug at
          https://github.com/lit/lit/issues/new?template=bug_report.md
          and include information about your build tooling, if any.
        `
        .trim()
        .replace(
          /\n */g,
          `
`,
        );
    }
    throw new Error(message);
  }
  return policy !== undefined ? policy.createHTML(stringFromTSA) : stringFromTSA;
}
var getTemplateHtml = (strings, type) => {
  const l = strings.length - 1;
  const attrNames = [];
  let html2 = type === SVG_RESULT ? "<svg>" : type === MATHML_RESULT ? "<math>" : "";
  let rawTextEndRegex;
  let regex = textEndRegex;
  for (let i = 0; i < l; i++) {
    const s = strings[i];
    let attrNameEndIndex = -1;
    let attrName;
    let lastIndex = 0;
    let match;
    while (lastIndex < s.length) {
      regex.lastIndex = lastIndex;
      match = regex.exec(s);
      if (match === null) {
        break;
      }
      lastIndex = regex.lastIndex;
      if (regex === textEndRegex) {
        if (match[COMMENT_START] === "!--") {
          regex = commentEndRegex;
        } else if (match[COMMENT_START] !== undefined) {
          regex = comment2EndRegex;
        } else if (match[TAG_NAME] !== undefined) {
          if (rawTextElement.test(match[TAG_NAME])) {
            rawTextEndRegex = new RegExp(`</${match[TAG_NAME]}`, "g");
          }
          regex = tagEndRegex;
        } else if (match[DYNAMIC_TAG_NAME] !== undefined) {
          if (DEV_MODE2) {
            throw new Error(
              "Bindings in tag names are not supported. Please use static templates instead. " +
                "See https://lit.dev/docs/templates/expressions/#static-expressions",
            );
          }
          regex = tagEndRegex;
        }
      } else if (regex === tagEndRegex) {
        if (match[ENTIRE_MATCH] === ">") {
          regex = rawTextEndRegex ?? textEndRegex;
          attrNameEndIndex = -1;
        } else if (match[ATTRIBUTE_NAME] === undefined) {
          attrNameEndIndex = -2;
        } else {
          attrNameEndIndex = regex.lastIndex - match[SPACES_AND_EQUALS].length;
          attrName = match[ATTRIBUTE_NAME];
          regex =
            match[QUOTE_CHAR] === undefined
              ? tagEndRegex
              : match[QUOTE_CHAR] === '"'
                ? doubleQuoteAttrEndRegex
                : singleQuoteAttrEndRegex;
        }
      } else if (regex === doubleQuoteAttrEndRegex || regex === singleQuoteAttrEndRegex) {
        regex = tagEndRegex;
      } else if (regex === commentEndRegex || regex === comment2EndRegex) {
        regex = textEndRegex;
      } else {
        regex = tagEndRegex;
        rawTextEndRegex = undefined;
      }
    }
    if (DEV_MODE2) {
      console.assert(
        attrNameEndIndex === -1 ||
          regex === tagEndRegex ||
          regex === singleQuoteAttrEndRegex ||
          regex === doubleQuoteAttrEndRegex,
        "unexpected parse state B",
      );
    }
    const end = regex === tagEndRegex && strings[i + 1].startsWith("/>") ? " " : "";
    html2 +=
      regex === textEndRegex
        ? s + nodeMarker
        : attrNameEndIndex >= 0
          ? (attrNames.push(attrName),
            s.slice(0, attrNameEndIndex) + boundAttributeSuffix + s.slice(attrNameEndIndex)) +
            marker +
            end
          : s + marker + (attrNameEndIndex === -2 ? i : end);
  }
  const htmlResult =
    html2 +
    (strings[l] || "<?>") +
    (type === SVG_RESULT ? "</svg>" : type === MATHML_RESULT ? "</math>" : "");
  return [trustFromTemplateString(strings, htmlResult), attrNames];
};

class Template {
  constructor({ strings, ["_$litType$"]: type }, options) {
    this.parts = [];
    let node;
    let nodeIndex = 0;
    let attrNameIndex = 0;
    const partCount = strings.length - 1;
    const parts = this.parts;
    const [html2, attrNames] = getTemplateHtml(strings, type);
    this.el = Template.createElement(html2, options);
    walker.currentNode = this.el.content;
    if (type === SVG_RESULT || type === MATHML_RESULT) {
      const wrapper = this.el.content.firstChild;
      wrapper.replaceWith(...wrapper.childNodes);
    }
    while ((node = walker.nextNode()) !== null && parts.length < partCount) {
      if (node.nodeType === 1) {
        if (DEV_MODE2) {
          const tag2 = node.localName;
          if (/^(?:textarea|template)$/i.test(tag2) && node.innerHTML.includes(marker)) {
            const m =
              `Expressions are not supported inside \`${tag2}\` ` +
              `elements. See https://lit.dev/msg/expression-in-${tag2} for more ` +
              `information.`;
            if (tag2 === "template") {
              throw new Error(m);
            } else issueWarning2("", m);
          }
        }
        if (node.hasAttributes()) {
          for (const name of node.getAttributeNames()) {
            if (name.endsWith(boundAttributeSuffix)) {
              const realName = attrNames[attrNameIndex++];
              const value = node.getAttribute(name);
              const statics = value.split(marker);
              const m = /([.?@])?(.*)/.exec(realName);
              parts.push({
                type: ATTRIBUTE_PART,
                index: nodeIndex,
                name: m[2],
                strings: statics,
                ctor:
                  m[1] === "."
                    ? PropertyPart
                    : m[1] === "?"
                      ? BooleanAttributePart
                      : m[1] === "@"
                        ? EventPart
                        : AttributePart,
              });
              node.removeAttribute(name);
            } else if (name.startsWith(marker)) {
              parts.push({
                type: ELEMENT_PART,
                index: nodeIndex,
              });
              node.removeAttribute(name);
            }
          }
        }
        if (rawTextElement.test(node.tagName)) {
          const strings2 = node.textContent.split(marker);
          const lastIndex = strings2.length - 1;
          if (lastIndex > 0) {
            node.textContent = trustedTypes2 ? trustedTypes2.emptyScript : "";
            for (let i = 0; i < lastIndex; i++) {
              node.append(strings2[i], createMarker());
              walker.nextNode();
              parts.push({ type: CHILD_PART, index: ++nodeIndex });
            }
            node.append(strings2[lastIndex], createMarker());
          }
        }
      } else if (node.nodeType === 8) {
        const data = node.data;
        if (data === markerMatch) {
          parts.push({ type: CHILD_PART, index: nodeIndex });
        } else {
          let i = -1;
          while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
            parts.push({ type: COMMENT_PART, index: nodeIndex });
            i += marker.length - 1;
          }
        }
      }
      nodeIndex++;
    }
    if (DEV_MODE2) {
      if (attrNames.length !== attrNameIndex) {
        throw new Error(
          `Detected duplicate attribute bindings. This occurs if your template ` +
            `has duplicate attributes on an element tag. For example ` +
            `"<input ?disabled=\${true} ?disabled=\${false}>" contains a ` +
            `duplicate "disabled" attribute. The error was detected in ` +
            `the following template: 
` +
            "`" +
            strings.join("${...}") +
            "`",
        );
      }
    }
    debugLogEvent2 &&
      debugLogEvent2({
        kind: "template prep",
        template: this,
        clonableTemplate: this.el,
        parts: this.parts,
        strings,
      });
  }
  static createElement(html2, _options) {
    const el = d.createElement("template");
    el.innerHTML = html2;
    return el;
  }
}
function resolveDirective(part, value, parent = part, attributeIndex) {
  if (value === noChange) {
    return value;
  }
  let currentDirective =
    attributeIndex !== undefined ? parent.__directives?.[attributeIndex] : parent.__directive;
  const nextDirectiveConstructor = isPrimitive(value) ? undefined : value["_$litDirective$"];
  if (currentDirective?.constructor !== nextDirectiveConstructor) {
    currentDirective?.["_$notifyDirectiveConnectionChanged"]?.(false);
    if (nextDirectiveConstructor === undefined) {
      currentDirective = undefined;
    } else {
      currentDirective = new nextDirectiveConstructor(part);
      currentDirective._$initialize(part, parent, attributeIndex);
    }
    if (attributeIndex !== undefined) {
      (parent.__directives ??= [])[attributeIndex] = currentDirective;
    } else {
      parent.__directive = currentDirective;
    }
  }
  if (currentDirective !== undefined) {
    value = resolveDirective(
      part,
      currentDirective._$resolve(part, value.values),
      currentDirective,
      attributeIndex,
    );
  }
  return value;
}

class TemplateInstance {
  constructor(template, parent) {
    this._$parts = [];
    this._$disconnectableChildren = undefined;
    this._$template = template;
    this._$parent = parent;
  }
  get parentNode() {
    return this._$parent.parentNode;
  }
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  _clone(options) {
    const {
      el: { content },
      parts,
    } = this._$template;
    const fragment = (options?.creationScope ?? d).importNode(content, true);
    walker.currentNode = fragment;
    let node = walker.nextNode();
    let nodeIndex = 0;
    let partIndex = 0;
    let templatePart = parts[0];
    while (templatePart !== undefined) {
      if (nodeIndex === templatePart.index) {
        let part;
        if (templatePart.type === CHILD_PART) {
          part = new ChildPart(node, node.nextSibling, this, options);
        } else if (templatePart.type === ATTRIBUTE_PART) {
          part = new templatePart.ctor(
            node,
            templatePart.name,
            templatePart.strings,
            this,
            options,
          );
        } else if (templatePart.type === ELEMENT_PART) {
          part = new ElementPart(node, this, options);
        }
        this._$parts.push(part);
        templatePart = parts[++partIndex];
      }
      if (nodeIndex !== templatePart?.index) {
        node = walker.nextNode();
        nodeIndex++;
      }
    }
    walker.currentNode = d;
    return fragment;
  }
  _update(values) {
    let i = 0;
    for (const part of this._$parts) {
      if (part !== undefined) {
        debugLogEvent2 &&
          debugLogEvent2({
            kind: "set part",
            part,
            value: values[i],
            valueIndex: i,
            values,
            templateInstance: this,
          });
        if (part.strings !== undefined) {
          part._$setValue(values, part, i);
          i += part.strings.length - 2;
        } else {
          part._$setValue(values[i]);
        }
      }
      i++;
    }
  }
}

class ChildPart {
  get _$isConnected() {
    return this._$parent?._$isConnected ?? this.__isConnected;
  }
  constructor(startNode, endNode, parent, options) {
    this.type = CHILD_PART;
    this._$committedValue = nothing;
    this._$disconnectableChildren = undefined;
    this._$startNode = startNode;
    this._$endNode = endNode;
    this._$parent = parent;
    this.options = options;
    this.__isConnected = options?.isConnected ?? true;
    if (ENABLE_EXTRA_SECURITY_HOOKS) {
      this._textSanitizer = undefined;
    }
  }
  get parentNode() {
    let parentNode = wrap(this._$startNode).parentNode;
    const parent = this._$parent;
    if (parent !== undefined && parentNode?.nodeType === 11) {
      parentNode = parent.parentNode;
    }
    return parentNode;
  }
  get startNode() {
    return this._$startNode;
  }
  get endNode() {
    return this._$endNode;
  }
  _$setValue(value, directiveParent = this) {
    if (DEV_MODE2 && this.parentNode === null) {
      throw new Error(
        `This \`ChildPart\` has no \`parentNode\` and therefore cannot accept a value. This likely means the element containing the part was manipulated in an unsupported way outside of Lit's control such that the part's marker nodes were ejected from DOM. For example, setting the element's \`innerHTML\` or \`textContent\` can do this.`,
      );
    }
    value = resolveDirective(this, value, directiveParent);
    if (isPrimitive(value)) {
      if (value === nothing || value == null || value === "") {
        if (this._$committedValue !== nothing) {
          debugLogEvent2 &&
            debugLogEvent2({
              kind: "commit nothing to child",
              start: this._$startNode,
              end: this._$endNode,
              parent: this._$parent,
              options: this.options,
            });
          this._$clear();
        }
        this._$committedValue = nothing;
      } else if (value !== this._$committedValue && value !== noChange) {
        this._commitText(value);
      }
    } else if (value["_$litType$"] !== undefined) {
      this._commitTemplateResult(value);
    } else if (value.nodeType !== undefined) {
      if (DEV_MODE2 && this.options?.host === value) {
        this._commitText(
          `[probable mistake: rendered a template's host in itself ` +
            `(commonly caused by writing \${this} in a template]`,
        );
        console.warn(
          `Attempted to render the template host`,
          value,
          `inside itself. This is almost always a mistake, and in dev mode `,
          `we render some warning text. In production however, we'll `,
          `render it, which will usually result in an error, and sometimes `,
          `in the element disappearing from the DOM.`,
        );
        return;
      }
      this._commitNode(value);
    } else if (isIterable(value)) {
      this._commitIterable(value);
    } else {
      this._commitText(value);
    }
  }
  _insert(node) {
    return wrap(wrap(this._$startNode).parentNode).insertBefore(node, this._$endNode);
  }
  _commitNode(value) {
    if (this._$committedValue !== value) {
      this._$clear();
      if (ENABLE_EXTRA_SECURITY_HOOKS && sanitizerFactoryInternal !== noopSanitizer) {
        const parentNodeName = this._$startNode.parentNode?.nodeName;
        if (parentNodeName === "STYLE" || parentNodeName === "SCRIPT") {
          let message = "Forbidden";
          if (DEV_MODE2) {
            if (parentNodeName === "STYLE") {
              message =
                `Lit does not support binding inside style nodes. ` +
                `This is a security risk, as style injection attacks can ` +
                `exfiltrate data and spoof UIs. ` +
                `Consider instead using css\`...\` literals ` +
                `to compose styles, and do dynamic styling with ` +
                `css custom properties, ::parts, <slot>s, ` +
                `and by mutating the DOM rather than stylesheets.`;
            } else {
              message =
                `Lit does not support binding inside script nodes. ` +
                `This is a security risk, as it could allow arbitrary ` +
                `code execution.`;
            }
          }
          throw new Error(message);
        }
      }
      debugLogEvent2 &&
        debugLogEvent2({
          kind: "commit node",
          start: this._$startNode,
          parent: this._$parent,
          value,
          options: this.options,
        });
      this._$committedValue = this._insert(value);
    }
  }
  _commitText(value) {
    if (this._$committedValue !== nothing && isPrimitive(this._$committedValue)) {
      const node = wrap(this._$startNode).nextSibling;
      if (ENABLE_EXTRA_SECURITY_HOOKS) {
        if (this._textSanitizer === undefined) {
          this._textSanitizer = createSanitizer(node, "data", "property");
        }
        value = this._textSanitizer(value);
      }
      debugLogEvent2 &&
        debugLogEvent2({
          kind: "commit text",
          node,
          value,
          options: this.options,
        });
      node.data = value;
    } else {
      if (ENABLE_EXTRA_SECURITY_HOOKS) {
        const textNode = d.createTextNode("");
        this._commitNode(textNode);
        if (this._textSanitizer === undefined) {
          this._textSanitizer = createSanitizer(textNode, "data", "property");
        }
        value = this._textSanitizer(value);
        debugLogEvent2 &&
          debugLogEvent2({
            kind: "commit text",
            node: textNode,
            value,
            options: this.options,
          });
        textNode.data = value;
      } else {
        this._commitNode(d.createTextNode(value));
        debugLogEvent2 &&
          debugLogEvent2({
            kind: "commit text",
            node: wrap(this._$startNode).nextSibling,
            value,
            options: this.options,
          });
      }
    }
    this._$committedValue = value;
  }
  _commitTemplateResult(result) {
    const { values, ["_$litType$"]: type } = result;
    const template =
      typeof type === "number"
        ? this._$getTemplate(result)
        : (type.el === undefined &&
            (type.el = Template.createElement(
              trustFromTemplateString(type.h, type.h[0]),
              this.options,
            )),
          type);
    if (this._$committedValue?._$template === template) {
      debugLogEvent2 &&
        debugLogEvent2({
          kind: "template updating",
          template,
          instance: this._$committedValue,
          parts: this._$committedValue._$parts,
          options: this.options,
          values,
        });
      this._$committedValue._update(values);
    } else {
      const instance = new TemplateInstance(template, this);
      const fragment = instance._clone(this.options);
      debugLogEvent2 &&
        debugLogEvent2({
          kind: "template instantiated",
          template,
          instance,
          parts: instance._$parts,
          options: this.options,
          fragment,
          values,
        });
      instance._update(values);
      debugLogEvent2 &&
        debugLogEvent2({
          kind: "template instantiated and updated",
          template,
          instance,
          parts: instance._$parts,
          options: this.options,
          fragment,
          values,
        });
      this._commitNode(fragment);
      this._$committedValue = instance;
    }
  }
  _$getTemplate(result) {
    let template = templateCache.get(result.strings);
    if (template === undefined) {
      templateCache.set(result.strings, (template = new Template(result)));
    }
    return template;
  }
  _commitIterable(value) {
    if (!isArray(this._$committedValue)) {
      this._$committedValue = [];
      this._$clear();
    }
    const itemParts = this._$committedValue;
    let partIndex = 0;
    let itemPart;
    for (const item of value) {
      if (partIndex === itemParts.length) {
        itemParts.push(
          (itemPart = new ChildPart(
            this._insert(createMarker()),
            this._insert(createMarker()),
            this,
            this.options,
          )),
        );
      } else {
        itemPart = itemParts[partIndex];
      }
      itemPart._$setValue(item);
      partIndex++;
    }
    if (partIndex < itemParts.length) {
      this._$clear(itemPart && wrap(itemPart._$endNode).nextSibling, partIndex);
      itemParts.length = partIndex;
    }
  }
  _$clear(start = wrap(this._$startNode).nextSibling, from) {
    this._$notifyConnectionChanged?.(false, true, from);
    while (start !== this._$endNode) {
      const n = wrap(start).nextSibling;
      wrap(start).remove();
      start = n;
    }
  }
  setConnected(isConnected) {
    if (this._$parent === undefined) {
      this.__isConnected = isConnected;
      this._$notifyConnectionChanged?.(isConnected);
    } else if (DEV_MODE2) {
      throw new Error(
        "part.setConnected() may only be called on a " + "RootPart returned from render().",
      );
    }
  }
}

class AttributePart {
  get tagName() {
    return this.element.tagName;
  }
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  constructor(element, name, strings, parent, options) {
    this.type = ATTRIBUTE_PART;
    this._$committedValue = nothing;
    this._$disconnectableChildren = undefined;
    this.element = element;
    this.name = name;
    this._$parent = parent;
    this.options = options;
    if (strings.length > 2 || strings[0] !== "" || strings[1] !== "") {
      this._$committedValue = new Array(strings.length - 1).fill(new String());
      this.strings = strings;
    } else {
      this._$committedValue = nothing;
    }
    if (ENABLE_EXTRA_SECURITY_HOOKS) {
      this._sanitizer = undefined;
    }
  }
  _$setValue(value, directiveParent = this, valueIndex, noCommit) {
    const strings = this.strings;
    let change = false;
    if (strings === undefined) {
      value = resolveDirective(this, value, directiveParent, 0);
      change = !isPrimitive(value) || (value !== this._$committedValue && value !== noChange);
      if (change) {
        this._$committedValue = value;
      }
    } else {
      const values = value;
      value = strings[0];
      let i, v;
      for (i = 0; i < strings.length - 1; i++) {
        v = resolveDirective(this, values[valueIndex + i], directiveParent, i);
        if (v === noChange) {
          v = this._$committedValue[i];
        }
        change ||= !isPrimitive(v) || v !== this._$committedValue[i];
        if (v === nothing) {
          value = nothing;
        } else if (value !== nothing) {
          value += (v ?? "") + strings[i + 1];
        }
        this._$committedValue[i] = v;
      }
    }
    if (change && !noCommit) {
      this._commitValue(value);
    }
  }
  _commitValue(value) {
    if (value === nothing) {
      wrap(this.element).removeAttribute(this.name);
    } else {
      if (ENABLE_EXTRA_SECURITY_HOOKS) {
        if (this._sanitizer === undefined) {
          this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "attribute");
        }
        value = this._sanitizer(value ?? "");
      }
      debugLogEvent2 &&
        debugLogEvent2({
          kind: "commit attribute",
          element: this.element,
          name: this.name,
          value,
          options: this.options,
        });
      wrap(this.element).setAttribute(this.name, value ?? "");
    }
  }
}

class PropertyPart extends AttributePart {
  constructor() {
    super(...arguments);
    this.type = PROPERTY_PART;
  }
  _commitValue(value) {
    if (ENABLE_EXTRA_SECURITY_HOOKS) {
      if (this._sanitizer === undefined) {
        this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "property");
      }
      value = this._sanitizer(value);
    }
    debugLogEvent2 &&
      debugLogEvent2({
        kind: "commit property",
        element: this.element,
        name: this.name,
        value,
        options: this.options,
      });
    this.element[this.name] = value === nothing ? undefined : value;
  }
}

class BooleanAttributePart extends AttributePart {
  constructor() {
    super(...arguments);
    this.type = BOOLEAN_ATTRIBUTE_PART;
  }
  _commitValue(value) {
    debugLogEvent2 &&
      debugLogEvent2({
        kind: "commit boolean attribute",
        element: this.element,
        name: this.name,
        value: !!(value && value !== nothing),
        options: this.options,
      });
    wrap(this.element).toggleAttribute(this.name, !!value && value !== nothing);
  }
}

class EventPart extends AttributePart {
  constructor(element, name, strings, parent, options) {
    super(element, name, strings, parent, options);
    this.type = EVENT_PART;
    if (DEV_MODE2 && this.strings !== undefined) {
      throw new Error(
        `A \`<${element.localName}>\` has a \`@${name}=...\` listener with ` +
          "invalid content. Event listeners in templates must have exactly " +
          "one expression and no surrounding text.",
      );
    }
  }
  _$setValue(newListener, directiveParent = this) {
    newListener = resolveDirective(this, newListener, directiveParent, 0) ?? nothing;
    if (newListener === noChange) {
      return;
    }
    const oldListener = this._$committedValue;
    const shouldRemoveListener =
      (newListener === nothing && oldListener !== nothing) ||
      newListener.capture !== oldListener.capture ||
      newListener.once !== oldListener.once ||
      newListener.passive !== oldListener.passive;
    const shouldAddListener =
      newListener !== nothing && (oldListener === nothing || shouldRemoveListener);
    debugLogEvent2 &&
      debugLogEvent2({
        kind: "commit event listener",
        element: this.element,
        name: this.name,
        value: newListener,
        options: this.options,
        removeListener: shouldRemoveListener,
        addListener: shouldAddListener,
        oldListener,
      });
    if (shouldRemoveListener) {
      this.element.removeEventListener(this.name, this, oldListener);
    }
    if (shouldAddListener) {
      this.element.addEventListener(this.name, this, newListener);
    }
    this._$committedValue = newListener;
  }
  handleEvent(event) {
    if (typeof this._$committedValue === "function") {
      this._$committedValue.call(this.options?.host ?? this.element, event);
    } else {
      this._$committedValue.handleEvent(event);
    }
  }
}

class ElementPart {
  constructor(element, parent, options) {
    this.element = element;
    this.type = ELEMENT_PART;
    this._$disconnectableChildren = undefined;
    this._$parent = parent;
    this.options = options;
  }
  get _$isConnected() {
    return this._$parent._$isConnected;
  }
  _$setValue(value) {
    debugLogEvent2 &&
      debugLogEvent2({
        kind: "commit to element binding",
        element: this.element,
        value,
        options: this.options,
      });
    resolveDirective(this, value);
  }
}
var polyfillSupport2 = DEV_MODE2
  ? global3.litHtmlPolyfillSupportDevMode
  : global3.litHtmlPolyfillSupport;
polyfillSupport2?.(Template, ChildPart);
(global3.litHtmlVersions ??= []).push("3.3.2");
if (DEV_MODE2 && global3.litHtmlVersions.length > 1) {
  queueMicrotask(() => {
    issueWarning2(
      "multiple-versions",
      `Multiple versions of Lit loaded. ` + `Loading multiple versions is not recommended.`,
    );
  });
}
var render = (value, container, options) => {
  if (DEV_MODE2 && container == null) {
    throw new TypeError(`The container to render into may not be ${container}`);
  }
  const renderId = DEV_MODE2 ? debugLogRenderId++ : 0;
  const partOwnerNode = options?.renderBefore ?? container;
  let part = partOwnerNode["_$litPart$"];
  debugLogEvent2 &&
    debugLogEvent2({
      kind: "begin render",
      id: renderId,
      value,
      container,
      options,
      part,
    });
  if (part === undefined) {
    const endNode = options?.renderBefore ?? null;
    partOwnerNode["_$litPart$"] = part = new ChildPart(
      container.insertBefore(createMarker(), endNode),
      endNode,
      undefined,
      options ?? {},
    );
  }
  part._$setValue(value);
  debugLogEvent2 &&
    debugLogEvent2({
      kind: "end render",
      id: renderId,
      value,
      container,
      options,
      part,
    });
  return part;
};
if (ENABLE_EXTRA_SECURITY_HOOKS) {
  render.setSanitizer = setSanitizer;
  render.createSanitizer = createSanitizer;
  if (DEV_MODE2) {
    render._testOnlyClearSanitizerFactoryDoNotCallOrElse =
      _testOnlyClearSanitizerFactoryDoNotCallOrElse;
  }
}

// ../2026-03-15-pi-ui/node_modules/lit-element/development/lit-element.js
var JSCompiler_renameProperty2 = (prop, _obj) => prop;
var DEV_MODE3 = true;
var global4 = globalThis;
var issueWarning3;
if (DEV_MODE3) {
  global4.litIssuedWarnings ??= new Set();
  issueWarning3 = (code, warning) => {
    warning += ` See https://lit.dev/msg/${code} for more information.`;
    if (!global4.litIssuedWarnings.has(warning) && !global4.litIssuedWarnings.has(code)) {
      console.warn(warning);
      global4.litIssuedWarnings.add(warning);
    }
  };
}

class LitElement extends ReactiveElement {
  constructor() {
    super(...arguments);
    this.renderOptions = { host: this };
    this.__childPart = undefined;
  }
  createRenderRoot() {
    const renderRoot = super.createRenderRoot();
    this.renderOptions.renderBefore ??= renderRoot.firstChild;
    return renderRoot;
  }
  update(changedProperties) {
    const value = this.render();
    if (!this.hasUpdated) {
      this.renderOptions.isConnected = this.isConnected;
    }
    super.update(changedProperties);
    this.__childPart = render(value, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback();
    this.__childPart?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.__childPart?.setConnected(false);
  }
  render() {
    return noChange;
  }
}
LitElement["_$litElement$"] = true;
LitElement[JSCompiler_renameProperty2("finalized", LitElement)] = true;
global4.litElementHydrateSupport?.({ LitElement });
var polyfillSupport3 = DEV_MODE3
  ? global4.litElementPolyfillSupportDevMode
  : global4.litElementPolyfillSupport;
polyfillSupport3?.({ LitElement });
(global4.litElementVersions ??= []).push("4.2.2");
if (DEV_MODE3 && global4.litElementVersions.length > 1) {
  queueMicrotask(() => {
    issueWarning3(
      "multiple-versions",
      `Multiple versions of Lit loaded. Loading multiple versions ` + `is not recommended.`,
    );
  });
}
// ../2026-03-15-pi-ui/node_modules/@lit/reactive-element/development/decorators/custom-element.js
var customElement = (tagName) => (classOrTarget, context) => {
  if (context !== undefined) {
    context.addInitializer(() => {
      customElements.define(tagName, classOrTarget);
    });
  } else {
    customElements.define(tagName, classOrTarget);
  }
};
// ../2026-03-15-pi-ui/node_modules/@lit/reactive-element/development/decorators/property.js
var DEV_MODE4 = true;
var issueWarning4;
if (DEV_MODE4) {
  globalThis.litIssuedWarnings ??= new Set();
  issueWarning4 = (code, warning) => {
    warning += ` See https://lit.dev/msg/${code} for more information.`;
    if (!globalThis.litIssuedWarnings.has(warning) && !globalThis.litIssuedWarnings.has(code)) {
      console.warn(warning);
      globalThis.litIssuedWarnings.add(warning);
    }
  };
}
var legacyProperty = (options, proto, name) => {
  const hasOwnProperty = proto.hasOwnProperty(name);
  proto.constructor.createProperty(name, options);
  return hasOwnProperty ? Object.getOwnPropertyDescriptor(proto, name) : undefined;
};
var defaultPropertyDeclaration2 = {
  attribute: true,
  type: String,
  converter: defaultConverter,
  reflect: false,
  hasChanged: notEqual,
};
var standardProperty = (options = defaultPropertyDeclaration2, target, context) => {
  const { kind, metadata } = context;
  if (DEV_MODE4 && metadata == null) {
    issueWarning4(
      "missing-class-metadata",
      `The class ${target} is missing decorator metadata. This ` +
        `could mean that you're using a compiler that supports decorators ` +
        `but doesn't support decorator metadata, such as TypeScript 5.1. ` +
        `Please update your compiler.`,
    );
  }
  let properties = globalThis.litPropertyMetadata.get(metadata);
  if (properties === undefined) {
    globalThis.litPropertyMetadata.set(metadata, (properties = new Map()));
  }
  if (kind === "setter") {
    options = Object.create(options);
    options.wrapped = true;
  }
  properties.set(context.name, options);
  if (kind === "accessor") {
    const { name } = context;
    return {
      set(v) {
        const oldValue = target.get.call(this);
        target.set.call(this, v);
        this.requestUpdate(name, oldValue, options, true, v);
      },
      init(v) {
        if (v !== undefined) {
          this._$changeProperty(name, undefined, options, v);
        }
        return v;
      },
    };
  } else if (kind === "setter") {
    const { name } = context;
    return function (value) {
      const oldValue = this[name];
      target.call(this, value);
      this.requestUpdate(name, oldValue, options, true, value);
    };
  }
  throw new Error(`Unsupported decorator location: ${kind}`);
};
function property(options) {
  return (protoOrTarget, nameOrContext) => {
    return typeof nameOrContext === "object"
      ? standardProperty(options, protoOrTarget, nameOrContext)
      : legacyProperty(options, protoOrTarget, nameOrContext);
  };
}
// ../2026-03-15-pi-ui/node_modules/@lit/reactive-element/development/decorators/base.js
var desc = (obj, name, descriptor) => {
  descriptor.configurable = true;
  descriptor.enumerable = true;
  if (Reflect.decorate && typeof name !== "object") {
    Object.defineProperty(obj, name, descriptor);
  }
  return descriptor;
};

// ../2026-03-15-pi-ui/node_modules/@lit/reactive-element/development/decorators/query.js
var DEV_MODE5 = true;
var issueWarning5;
if (DEV_MODE5) {
  globalThis.litIssuedWarnings ??= new Set();
  issueWarning5 = (code, warning) => {
    warning += code ? ` See https://lit.dev/msg/${code} for more information.` : "";
    if (!globalThis.litIssuedWarnings.has(warning) && !globalThis.litIssuedWarnings.has(code)) {
      console.warn(warning);
      globalThis.litIssuedWarnings.add(warning);
    }
  };
}
function query(selector, cache) {
  return (protoOrTarget, nameOrContext, descriptor) => {
    const doQuery = (el) => {
      const result = el.renderRoot?.querySelector(selector) ?? null;
      if (DEV_MODE5 && result === null && cache && !el.hasUpdated) {
        const name = typeof nameOrContext === "object" ? nameOrContext.name : nameOrContext;
        issueWarning5(
          "",
          `@query'd field ${JSON.stringify(String(name))} with the 'cache' ` +
            `flag set for selector '${selector}' has been accessed before ` +
            `the first update and returned null. This is expected if the ` +
            `renderRoot tree has not been provided beforehand (e.g. via ` +
            `Declarative Shadow DOM). Therefore the value hasn't been cached.`,
        );
      }
      return result;
    };
    if (cache) {
      const { get, set } =
        typeof nameOrContext === "object"
          ? protoOrTarget
          : (descriptor ??
            (() => {
              const key = DEV_MODE5
                ? Symbol(`${String(nameOrContext)} (@query() cache)`)
                : Symbol();
              return {
                get() {
                  return this[key];
                },
                set(v) {
                  this[key] = v;
                },
              };
            })());
      return desc(protoOrTarget, nameOrContext, {
        get() {
          let result = get.call(this);
          if (result === undefined) {
            result = doQuery(this);
            if (result !== null || this.hasUpdated) {
              set.call(this, result);
            }
          }
          return result;
        },
      });
    } else {
      return desc(protoOrTarget, nameOrContext, {
        get() {
          return doQuery(this);
        },
      });
    }
  };
}
// ../2026-03-15-pi-ui/node_modules/lit-html/development/directives/map.js
function* map(items, f) {
  if (items !== undefined) {
    let i = 0;
    for (const value of items) {
      yield f(value, i++);
    }
  }
}
// ../2026-03-15-pi-ui/packages/ai-ui/dist/ai-ui.js
var __legacyDecorateClassTS = function (decorators, target, key, desc2) {
  var c = arguments.length,
    r =
      c < 3
        ? target
        : desc2 === null
          ? (desc2 = Object.getOwnPropertyDescriptor(target, key))
          : desc2,
    d2;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
    r = Reflect.decorate(decorators, target, key, desc2);
  else
    for (var i = decorators.length - 1; i >= 0; i--)
      if ((d2 = decorators[i]))
        r = (c < 3 ? d2(r) : c > 3 ? d2(target, key, r) : d2(target, key)) || r;
  return (c > 3 && r && Object.defineProperty(target, key, r), r);
};

class AiConversation extends LitElement {
  constructor() {
    super(...arguments);
    this.density = "comfortable";
    this.live = false;
    this.label = "Conversation";
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      margin: 0;
      padding: 0;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    .conversation {
      display: flex;
      flex-direction: column;
      gap: var(--ai-conversation-gap, var(--ai-space-lg, 16px));
      background: var(--ai-conversation-background, transparent);
      color: var(--ai-conversation-color, var(--ai-color-text, inherit));
    }

    .conversation[data-density="compact"] {
      gap: var(--ai-conversation-compact-gap, var(--ai-space-sm, 8px));
    }

    :host([live]) .conversation {
      border-left: 2px solid var(--ai-conversation-live-border-color, transparent);
    }
  `;
  get normalizedDensity() {
    return this.density === "compact" ? "compact" : "comfortable";
  }
  render() {
    const ariaLive = this.live ? "polite" : "off";
    return html`
      <section
        class="conversation"
        data-density=${this.normalizedDensity}
        aria-label=${this.getAttribute("aria-label") ?? this.label}
        aria-live=${ariaLive}
        aria-relevant="additions text"
      >
        <slot></slot>
      </section>
    `;
  }
}
__legacyDecorateClassTS(
  [property({ reflect: true })],
  AiConversation.prototype,
  "density",
  undefined,
);
__legacyDecorateClassTS(
  [property({ type: Boolean, reflect: true })],
  AiConversation.prototype,
  "live",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true })],
  AiConversation.prototype,
  "label",
  undefined,
);
AiConversation = __legacyDecorateClassTS([customElement("ai-conversation")], AiConversation);

class AiMessage extends LitElement {
  constructor() {
    super(...arguments);
    this.role = "assistant";
    this.htmlFor = "";
    this.status = "unknown";
    this.timestamp = "";
    this.label = "";
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      margin: 0;
      padding: 0;
      max-width: 100%;
      min-width: 0;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    .message {
      display: flex;
      flex-direction: column;
      min-width: 0;
      max-width: 100%;
      background-color: var(--ai-message-background, transparent);
      color: var(--ai-message-color, inherit);
      border: var(--ai-message-border-width, 0) solid var(--ai-message-border-color, transparent);
      border-radius: var(--ai-message-radius, 0);
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: var(--ai-message-gap, 3px);
      min-width: 0;
      max-width: 100%;
    }

    .content ::slotted(*) {
      min-width: 0;
      max-width: 100%;
    }

    ::slotted([slot="meta"]) {
      color: var(--ai-message-meta-color, var(--text-muted, var(--ai-color-text-muted, #888)));
      font-size: var(--font-size-caption, var(--ai-font-size-caption, 0.75rem));
      line-height: var(--line-height-tight, var(--ai-line-height-tight, 1.1));
    }

    .meta-fallback {
      color: var(--ai-message-meta-color, var(--text-muted, var(--ai-color-text-muted, #888)));
      font-size: var(--font-size-caption, var(--ai-font-size-caption, 0.75rem));
      line-height: var(--line-height-tight, var(--ai-line-height-tight, 1.1));
    }

    /* User bubble treatment. */
    :host([role="user"]) .message {
      align-items: flex-end;
      gap: calc(var(--spacing-xs, 4px) / 2);
    }

    :host([role="user"]) .content {
      width: auto;
      max-width: var(--ai-message-user-max-width, min(90%, 640px));
      padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
      background: var(--ai-message-user-background, var(--accent, Highlight));
      color: var(--ai-message-user-color, var(--text-on-accent, HighlightText));
      border-radius: var(
        --ai-message-radius,
        var(--radius, 8px) var(--radius, 8px) 4px var(--radius, 8px)
      );
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      overflow-wrap: anywhere;
    }

    /* Assistant rail/header treatment. */
    :host([role="assistant"]) .message {
      align-items: stretch;
      gap: 2px;
      width: 100%;
    }

    .header {
      display: none;
    }

    :host([role="assistant"]) .header {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-sm, 8px);
      padding-left: calc(var(--spacing-md, 12px) + 2px);
      line-height: var(--line-height-tight, 1.1);
    }

    .actor-label {
      color: var(--ai-message-assistant-label-color, var(--text-muted, #888));
      font-size: var(--font-size-caption, 0.75rem);
      font-weight: var(--font-weight-bold, 700);
      letter-spacing: var(--tracking-overline, 0.08em);
      line-height: var(--line-height-tight, 1.1);
      text-transform: uppercase;
    }

    :host([role="assistant"]) .content {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      padding-left: calc(var(--spacing-md, 12px) + 2px);
      border-left: 1px solid var(--ai-message-assistant-rail-color, rgba(255, 255, 255, 0.08));
      background: transparent;
      color: var(--ai-message-color, var(--text, inherit));
    }

    :host([role="tool"]) .message,
    :host([role="system"]) .message {
      gap: var(--ai-message-gap, 3px);
      color: var(--ai-message-color, var(--text, inherit));
    }

    :host([role="tool"]) .content {
      width: 100%;
    }

    :host([role="system"]) .content {
      color: color-mix(in oklch, var(--text-muted, currentColor) 92%, transparent);
      font-size: var(--font-size-meta, 0.8125rem);
    }

    @media (max-width: 420px) {
      :host([role="assistant"]) .header,
      :host([role="assistant"]) .content {
        padding-left: calc(var(--spacing-sm, 8px) + 2px);
      }
    }
  `;
  get normalizedRole() {
    if (
      this.role === "user" ||
      this.role === "assistant" ||
      this.role === "system" ||
      this.role === "tool"
    ) {
      return this.role;
    }
    return "system";
  }
  get actorLabel() {
    return this.label || (this.normalizedRole === "assistant" ? "Assistant" : this.normalizedRole);
  }
  render() {
    const role = this.normalizedRole;
    return html`
      <article class="message" data-role=${role} aria-busy=${this.status === "running"}>
        ${role === "assistant"
          ? html`
              <div class="header">
                <slot name="avatar"></slot>
                <slot name="actor"><span class="actor-label">${this.actorLabel}</span></slot>
                <slot name="meta"></slot>
              </div>
            `
          : nothing}
        <div class="content">
          <slot></slot>
        </div>
        ${role !== "assistant" ? html` <slot name="meta"></slot> ` : nothing}
      </article>
    `;
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiMessage.prototype, "role", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, attribute: "for" })],
  AiMessage.prototype,
  "htmlFor",
  undefined,
);
__legacyDecorateClassTS([property({ reflect: true })], AiMessage.prototype, "status", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiMessage.prototype, "timestamp", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiMessage.prototype, "label", undefined);
AiMessage = __legacyDecorateClassTS([customElement("ai-message")], AiMessage);
function getToolTone(name) {
  const normalized = name.toLowerCase();
  if (normalized.includes("read")) {
    return "read";
  }
  if (normalized.includes("write")) {
    return "write";
  }
  if (normalized.includes("edit")) {
    return "edit";
  }
  if (normalized.includes("bash")) {
    return "bash";
  }
  return "generic";
}

class HasSlotController {
  host;
  slotNames = [];
  constructor(host, ...slotNames) {
    (this.host = host).addController(this);
    this.slotNames = slotNames;
  }
  hasDefaultSlot() {
    return [...this.host.childNodes].some((node) => {
      if (node.nodeType === node.TEXT_NODE && node.textContent?.trim() !== "") {
        return true;
      }
      if (node.nodeType === node.ELEMENT_NODE) {
        const el = node;
        if (!el.hasAttribute("slot")) {
          return true;
        }
      }
      return false;
    });
  }
  hasNamedSlot(name) {
    return this.host.querySelector(`:scope > [slot="${name}"]`) !== null;
  }
  test(slotName) {
    return slotName === "[default]" ? this.hasDefaultSlot() : this.hasNamedSlot(slotName);
  }
  hostConnected() {
    this.host.shadowRoot?.addEventListener("slotchange", this.handleSlotChange);
  }
  hostDisconnected() {
    this.host.shadowRoot?.removeEventListener("slotchange", this.handleSlotChange);
  }
  handleSlotChange = (event) => {
    const slot = event.target;
    if (
      (this.slotNames.includes("[default]") && !slot.name) ||
      (slot.name && this.slotNames.includes(slot.name))
    ) {
      this.host.requestUpdate();
    }
  };
}
function renderGlyph(tone) {
  switch (tone) {
    case "read":
      return svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h12"></path><path d="M14 3v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path><path d="M14 3l6 6v10a2 2 0 0 1-2 2H6"></path></svg>`;
    case "write":
      return svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"></path></svg>`;
    case "edit":
      return svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M4 13.5V20h6.5L19 11.5 12.5 5 4 13.5Z"></path></svg>`;
    case "bash":
      return svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 17 6-5-6-5"></path><path d="M12 19h8"></path></svg>`;
    default:
      return nothing;
  }
}

class AiToolCall extends LitElement {
  constructor() {
    super(...arguments);
    this.id = "";
    this.name = "";
    this.label = "";
    this.kind = "unknown";
    this.effect = "unknown";
    this.headline = "";
    this.subline = "";
    this.status = "unknown";
    this.open = false;
  }
  static styles = css`
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    :host {
      display: block;
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      color: var(--ai-tool-call-color, var(--text, var(--ai-color-text, inherit)));
    }

    .row {
      --accent: color-mix(
        in oklch,
        var(--ai-tool-call-status-color, var(--text-muted, var(--ai-color-text-muted, #888))) 82%,
        var(--ai-tool-call-border-color, var(--border, var(--ai-color-border, #333)))
      );
      --surface-hover: color-mix(in oklch, var(--accent) 8%, transparent);
      --surface-open: color-mix(in oklch, var(--accent) 5%, transparent);
      display: block;
      min-width: 0;
      max-width: 100%;
      background: var(--ai-tool-call-background, var(--background-color, transparent));
      color: inherit;
    }

    .row[data-tone="read"] {
      --accent: oklch(74% 0.12 190);
    }
    .row[data-tone="write"] {
      --accent: oklch(78% 0.15 145);
    }
    .row[data-tone="edit"] {
      --accent: oklch(76% 0.17 85);
    }
    .row[data-tone="bash"] {
      --accent: oklch(68% 0.19 25);
    }

    .row[data-status="success"] {
      --accent: var(
        --ai-tool-call-success-color,
        var(--success-color, var(--success, var(--ai-color-success, #16a34a)))
      );
    }

    .row[data-status="running"],
    .row[data-status="pending"] {
      --accent: var(
        --ai-tool-call-running-color,
        var(--running-color, var(--accent, var(--ai-color-accent, Highlight)))
      );
    }

    .row[data-status="error"] {
      --accent: var(
        --ai-tool-call-error-color,
        var(--error-color, var(--error, var(--ai-color-error, #dc2626)))
      );
      --surface-hover: color-mix(in oklch, var(--accent) 10%, transparent);
      --surface-open: color-mix(in oklch, var(--accent) 7%, transparent);
    }

    .row-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: calc(var(--spacing-xs, 4px) + 2px);
      padding: 2px 4px;
      background: var(
        --ai-tool-call-summary-background,
        var(--summary-background-color, transparent)
      );
      list-style: none;
    }

    .row-header[interactive] {
      cursor: pointer;
      transition: background 0.16s ease;
    }

    .row-header[interactive]:hover {
      background: var(--surface-hover);
    }

    .row-header[interactive]:focus-visible {
      outline: 2px solid var(--focus, Highlight);
      outline-offset: 2px;
    }

    details[open] > .row-header {
      background: var(--surface-open);
    }

    summary.row-header::marker,
    summary.row-header::-webkit-details-marker {
      display: none;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .icon-frame {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: color-mix(in oklch, var(--accent) 62%, var(--text-muted, currentColor));
    }

    .icon-frame svg {
      width: 12.5px;
      height: 12.5px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .reasoning-dot {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.72;
    }

    .text-block {
      display: grid;
      gap: 1px;
      min-width: 0;
      padding-block: 1px;
    }

    .headline {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .badge {
      flex-shrink: 0;
      font-size: var(--font-size-caption, 0.75rem);
      font-weight: var(--font-weight-semibold, 600);
      line-height: var(--line-height-tight, 1.1);
      letter-spacing: var(--tracking-label, 0.04em);
      color: color-mix(in oklch, var(--accent) 52%, var(--text-muted, currentColor));
    }

    .headline-text {
      min-width: 0;
      font-size: var(--font-size-meta, 0.8125rem);
      line-height: var(--line-height-snug, 1.25);
      color: color-mix(in oklch, var(--text, currentColor) 88%, var(--text-muted, currentColor));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .subline {
      font-size: var(--font-size-caption, 0.75rem);
      line-height: var(--line-height-snug, 1.25);
      color: color-mix(in oklch, var(--text-muted, currentColor) 92%, transparent);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row[data-tone="generic"] .badge {
      color: color-mix(in oklch, var(--text-muted, currentColor) 92%, transparent);
    }

    .row[data-tone="generic"] .headline-text {
      color: color-mix(in oklch, var(--text, currentColor) 78%, var(--text-muted, currentColor));
    }

    .row[data-tone="read"] .headline-text {
      white-space: nowrap;
      display: block;
      -webkit-line-clamp: unset;
    }

    .chevron {
      width: 8px;
      height: 8px;
      flex-shrink: 0;
      color: color-mix(in oklch, var(--text-muted, currentColor) 88%, transparent);
      transition: transform 0.16s ease;
    }

    details[open] .chevron {
      transform: rotate(90deg);
    }

    .body {
      padding: 1px 4px calc(var(--spacing-xs, 4px) + 1px) 24px;
    }

    .body::before {
      content: "";
      display: block;
      height: 1px;
    }

    .body ::slotted(*) {
      display: block;
      min-width: 0;
    }

    .input-area {
      padding: var(--ai-space-xs, 2px) 4px var(--ai-space-xs, 2px) 24px;
      background: var(--ai-tool-call-input-background, var(--input-background-color, transparent));
    }

    .input-area ::slotted(*) {
      display: block;
      min-width: 0;
      margin: 0;
      max-width: 100%;
    }
  `;
  hasSlot = new HasSlotController(this, "[default]", "input", "summary");
  get tone() {
    return getToolTone(this.name);
  }
  get badgeText() {
    return this.label || this.name;
  }
  get headlineText() {
    return this.headline || this.label || "";
  }
  get hasBodyContent() {
    return this.hasSlot.test("[default]");
  }
  get hasInputContent() {
    return this.hasSlot.test("input");
  }
  get hasSummaryContent() {
    return this.hasSlot.test("summary");
  }
  get isExpandable() {
    return this.hasBodyContent || this.hasInputContent;
  }
  get hasVisibleHeaderContent() {
    return Boolean(this.badgeText || this.headlineText || this.subline);
  }
  show() {
    this.open = true;
  }
  hide() {
    this.open = false;
  }
  toggle(force) {
    this.open = force ?? !this.open;
  }
  emitToggle(isOpen) {
    this.dispatchEvent(
      new CustomEvent(isOpen ? "ai-show" : "ai-hide", {
        detail: { open: isOpen, id: this.id, name: this.name },
        bubbles: true,
        composed: true,
      }),
    );
  }
  handleToggle(e) {
    const details = e.currentTarget;
    const isOpen = details.open;
    if (this.open !== isOpen) {
      this.open = isOpen;
    }
    this.emitToggle(isOpen);
  }
  updated(changed) {
    if (changed.has("open") && changed.get("open") !== undefined) {
      const details = this.renderRoot.querySelector("details");
      if (details && details.open !== this.open) {
        details.open = this.open;
      }
    }
  }
  renderIcon() {
    const tone = this.tone;
    if (tone === "generic") {
      return html`
        <span class="icon-frame" aria-hidden="true">
          <span class="reasoning-dot"></span>
        </span>
      `;
    }
    return html`<span class="icon-frame" aria-hidden="true">${renderGlyph(tone)}</span>`;
  }
  renderHeaderContent() {
    return html`
      <span class="header-content">
        ${this.renderIcon()}
        <span class="text-block">
          <span class="headline">
            ${this.badgeText ? html`<span class="badge">${this.badgeText}</span>` : nothing}
            ${this.headlineText && this.headlineText !== this.badgeText
              ? html`<span class="headline-text">${this.headlineText}</span>`
              : nothing}
          </span>
          ${this.subline ? html`<span class="subline">${this.subline}</span>` : nothing}
        </span>
      </span>
      ${this.isExpandable
        ? html`
            <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M3 2.2 6.8 5 3 7.8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
          `
        : nothing}
    `;
  }
  render() {
    const tone = this.tone;
    const status = this.status;
    if (this.hasSummaryContent) {
      return html`
        <div class="row" data-tone=${tone} data-status=${status}>
          <slot name="summary"></slot>
          ${this.isExpandable
            ? html`
                <div class="body">
                  ${this.hasInputContent
                    ? html` <div class="input-area"><slot name="input"></slot></div> `
                    : nothing}
                  <slot></slot>
                </div>
              `
            : nothing}
        </div>
      `;
    }
    if (!this.isExpandable) {
      if (!this.hasVisibleHeaderContent) {
        return nothing;
      }
      return html`
        <div class="row" data-tone=${tone} data-status=${status}>
          <div class="row-header">${this.renderHeaderContent()}</div>
        </div>
      `;
    }
    return html`
      <details
        class="row"
        data-tone=${tone}
        data-status=${status}
        ?open=${this.open}
        @toggle=${this.handleToggle}
      >
        <summary class="row-header" interactive>${this.renderHeaderContent()}</summary>
        ${this.hasInputContent
          ? html` <div class="input-area"><slot name="input"></slot></div> `
          : nothing}
        <div class="body"><slot></slot></div>
      </details>
    `;
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "id", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "name", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "label", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "kind", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "effect", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "headline", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "subline", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolCall.prototype, "status", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiToolCall.prototype,
  "open",
  undefined,
);
AiToolCall = __legacyDecorateClassTS([customElement("ai-tool-call")], AiToolCall);
function isStructuredValue(value) {
  return (
    typeof value === "string" ||
    Array.isArray(value) ||
    (Boolean(value) && typeof value === "object")
  );
}
function extractFirstStructuredField(record, keys) {
  for (const key of keys) {
    const candidate = record[key];
    if (!isStructuredValue(candidate)) {
      continue;
    }
    const parts = extractStructuredText(candidate);
    if (parts.length > 0) {
      return parts;
    }
  }
}
function extractStructuredText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStructuredText(item));
  }
  if (value && typeof value === "object") {
    const record = value;
    const extracted = extractFirstStructuredField(record, [
      "text",
      "message",
      "content",
      "result",
      "output",
      "error",
    ]);
    return extracted ?? [JSON.stringify(value, undefined, 2)];
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [String(value)];
}
function normalizeToolOutput(content) {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed);
    const lines = extractStructuredText(parsed).filter(Boolean);
    if (lines.length > 0) {
      return lines.join(`

`);
    }
  } catch {}
  return trimmed;
}

class AiToolResult extends LitElement {
  constructor() {
    super(...arguments);
    this.htmlFor = "";
    this.name = "";
    this.status = "unknown";
    this.channel = "unknown";
    this.contentType = "text/plain";
    this.content = "";
    this.truncated = false;
  }
  hasSlot = new HasSlotController(this, "[default]", "meta");
  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      margin: 0;
      padding: 0;
      min-width: 0;
      max-width: 100%;
      background: var(--ai-tool-result-background, transparent);
      color: var(--ai-tool-result-color, var(--text, var(--ai-color-text, inherit)));
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: var(--ai-space-sm, 8px);
      min-width: 0;
      max-width: 100%;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: var(--ai-space-xs, 4px);
      color: var(--ai-tool-result-meta-color, var(--text-muted, var(--ai-color-text-muted, #888)));
      font-size: var(--font-size-caption, var(--ai-font-size-xs, 0.75rem));
    }

    .content {
      min-width: 0;
      max-width: 100%;
      color: var(--ai-tool-result-color, var(--text, var(--ai-color-text, inherit)));
    }

    pre {
      margin: 0;
      max-width: 100%;
      max-height: var(--ai-tool-result-max-height, 240px);
      overflow-x: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      color: var(
        --ai-tool-result-code-color,
        color-mix(in oklch, var(--text, currentColor) 82%, var(--text-muted, currentColor))
      );
      font-family: var(--ai-tool-result-code-font, var(--font-family-mono, monospace));
      font-size: var(--font-size-caption, 0.75rem);
      line-height: var(--line-height-body, 1.5);
      white-space: pre-wrap;
      word-break: break-word;
    }

    :host([channel="stderr"]) .content,
    :host([status="error"]) .content {
      color: var(--ai-tool-result-error-color, var(--error, var(--ai-color-error, #dc2626)));
    }

    :host([channel="log"]) .content {
      color: var(--ai-tool-result-meta-color, var(--text-muted, var(--ai-color-text-muted, #888)));
    }

    .truncation-indicator::after {
      content: " (truncated)";
      color: var(--ai-tool-result-meta-color, var(--text-muted, var(--ai-color-text-muted, #888)));
      font-style: italic;
    }
  `;
  get hasDefaultContent() {
    return this.hasSlot.test("[default]");
  }
  get hasMetaContent() {
    return this.hasSlot.test("meta");
  }
  render() {
    const body = normalizeToolOutput(this.content);
    return html`
      <div class="container">
        ${this.hasMetaContent ? html` <div class="meta"><slot name="meta"></slot></div> ` : nothing}
        <div class="content ${this.truncated ? "truncation-indicator" : ""}">
          ${this.hasDefaultContent
            ? html` <slot></slot> `
            : body
              ? html`<pre>${body}</pre>`
              : nothing}
        </div>
      </div>
    `;
  }
}
__legacyDecorateClassTS(
  [property({ reflect: true, attribute: "for" })],
  AiToolResult.prototype,
  "htmlFor",
  undefined,
);
__legacyDecorateClassTS([property({ reflect: true })], AiToolResult.prototype, "name", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiToolResult.prototype, "status", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true })],
  AiToolResult.prototype,
  "channel",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true, attribute: "content-type" })],
  AiToolResult.prototype,
  "contentType",
  undefined,
);
__legacyDecorateClassTS([property({ type: String })], AiToolResult.prototype, "content", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiToolResult.prototype,
  "truncated",
  undefined,
);
AiToolResult = __legacyDecorateClassTS([customElement("ai-tool-result")], AiToolResult);
function summarizeThinking(content) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Reasoning";
  }
  const sentence = normalized.match(/.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized;
  if (sentence.length <= 88) {
    return sentence;
  }
  return `${sentence.slice(0, 85).trimEnd()}…`;
}

class AiThinking extends LitElement {
  constructor() {
    super(...arguments);
    this.content = "";
    this.source = "unknown";
    this.redacted = false;
    this.open = false;
    this.headline = "";
  }
  static styles = css`
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    :host {
      display: block;
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      color: var(
        --ai-thinking-color,
        color-mix(in oklch, var(--text-muted, currentColor) 90%, transparent)
      );
    }

    .thinking-content {
      color: var(
        --ai-thinking-color,
        color-mix(in oklch, var(--text-muted, currentColor) 90%, transparent)
      );
      font-size: var(--font-size-caption, 0.75rem);
      line-height: var(--line-height-body, 1.5);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: var(--ai-thinking-max-height, 140px);
      overflow-x: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .redacted {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 4px;
      color: var(--ai-thinking-muted-color, var(--text-muted, var(--ai-color-text-muted, #888)));
      font-size: var(--font-size-caption, 0.75rem);
      line-height: var(--line-height-snug, 1.25);
      font-style: italic;
    }
  `;
  show() {
    if (this.redacted) {
      return;
    }
    this.open = true;
  }
  hide() {
    if (this.redacted) {
      return;
    }
    this.open = false;
  }
  toggle(force) {
    if (this.redacted) {
      return;
    }
    this.open = force ?? !this.open;
  }
  handleShow() {
    if (this.redacted) {
      return;
    }
    this.open = true;
    this.dispatchEvent(
      new CustomEvent("ai-show", {
        detail: { redacted: this.redacted },
        bubbles: true,
        composed: true,
      }),
    );
  }
  handleHide() {
    if (this.redacted) {
      return;
    }
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("ai-hide", {
        detail: { redacted: this.redacted },
        bubbles: true,
        composed: true,
      }),
    );
  }
  updated(changed) {
    if (changed.has("redacted") && this.redacted && this.open) {
      this.open = false;
    }
  }
  render() {
    if (this.redacted) {
      return html` <div class="redacted">Reasoning redacted<slot name="meta"></slot></div> `;
    }
    const content = this.content.trim();
    if (!content) {
      return html` <slot></slot> `;
    }
    return html`
      <ai-tool-call
        name="Reasoning"
        .headline=${this.headline || summarizeThinking(content)}
        .open=${this.open}
        @ai-show=${this.handleShow}
        @ai-hide=${this.handleHide}
      >
        <div class="thinking-content">${content}</div>
        <slot name="meta"></slot>
      </ai-tool-call>
    `;
  }
}
__legacyDecorateClassTS([property({ type: String })], AiThinking.prototype, "content", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiThinking.prototype, "source", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiThinking.prototype,
  "redacted",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiThinking.prototype,
  "open",
  undefined,
);
__legacyDecorateClassTS([property({ reflect: true })], AiThinking.prototype, "headline", undefined);
AiThinking = __legacyDecorateClassTS([customElement("ai-thinking")], AiThinking);
var KIND_LABELS = {
  status: "Status",
  "model-change": "Model Change",
  checkpoint: "Checkpoint",
  note: "Note",
  system: "System",
  error: "Error",
  custom: "Event",
};
var SEVERITY_COLORS = {
  info: "var(--ai-event-info-color, var(--ai-event-info, var(--ai-color-info, #3b82f6)))",
  warning:
    "var(--ai-event-warning-color, var(--ai-event-warning, var(--ai-color-warning, #f59e0b)))",
  error: "var(--ai-event-error-color, var(--ai-event-error, var(--ai-color-error, #ef4444)))",
};

class AiEvent extends LitElement {
  constructor() {
    super(...arguments);
    this.kind = "custom";
    this.severity = "info";
    this.source = "";
    this.htmlFor = "";
    this.open = false;
  }
  show() {
    this.open = true;
  }
  hide() {
    this.open = false;
  }
  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
  }
  _prevOpen = false;
  updated() {
    if (this._details && this._details.open !== this.open) {
      this._details.open = this.open;
    }
    if (this._prevOpen !== this.open) {
      this._prevOpen = this.open;
      this.dispatchEvent(
        new CustomEvent(this.open ? "ai-show" : "ai-hide", {
          detail: { kind: this.kind },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
  _onToggle() {
    const details = this._details;
    if (!details) {
      return;
    }
    this.open = details.open;
  }
  get _severityColor() {
    return SEVERITY_COLORS[this.severity] ?? SEVERITY_COLORS.info ?? "#888";
  }
  get _kindLabel() {
    return KIND_LABELS[this.kind] ?? KIND_LABELS.custom ?? "Custom";
  }
  render() {
    const accentColor = this._severityColor;
    return html`
      <details
        .open=${this.open}
        @toggle=${this._onToggle}
        part="details"
        style="--_accent: ${accentColor}"
      >
        <summary part="summary">
          <span class="summary-text" part="summary-text">
            <slot name="summary">
              <span class="kind-label" part="kind-label">${this._kindLabel}</span>
            </slot>
          </span>
          <span class="summary-rule" aria-hidden="true"></span>
          <span class="summary-meta" part="meta">
            <slot name="meta"></slot>
          </span>
          <span class="chevron" part="marker" aria-hidden="true">
            <svg viewBox="0 0 10 10" focusable="false">
              <path d="M3.25 2.25 6.25 5 3.25 7.75"></path>
            </svg>
          </span>
        </summary>

        <div class="content-shell" part="content-shell">
          <div class="content" part="content">
            <slot></slot>
          </div>
        </div>
      </details>
    `;
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      margin: 0;
      padding: 0;
      color: var(--ai-event-color, var(--ai-event-text-color, var(--text-muted, #8d867a)));
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    details {
      display: block;
      min-width: 0;
      max-width: 100%;
      margin: 0;
      background: var(--ai-event-background, var(--ai-event-background-color, transparent));
      border: var(--ai-event-border-width, 0) solid
        var(--ai-event-border-color, var(--ai-color-border, transparent));
      border-radius: var(--ai-event-radius, var(--ai-event-border-radius, 0));
    }

    summary {
      display: grid;
      grid-template-columns: auto minmax(24px, 1fr) auto 12px;
      align-items: center;
      column-gap: 8px;
      min-width: 0;
      list-style: none;
      cursor: pointer;
      color: var(
        --ai-event-summary-color,
        color-mix(in oklch, var(--text-muted, currentColor) 82%, var(--text, currentColor))
      );
      padding: 3px 4px;
      border-radius: var(--radius-sm, 5px);
      background: transparent;
      user-select: none;
      transition:
        background 0.16s ease,
        color 0.16s ease;
    }

    summary:hover {
      background: color-mix(in oklch, var(--_accent) 5%, transparent);
      color: color-mix(in oklch, var(--text, currentColor) 72%, var(--text-muted, currentColor));
    }

    summary:focus-visible {
      outline: 2px solid var(--focus, var(--_accent));
      outline-offset: 2px;
    }

    details[open] > summary {
      color: color-mix(in oklch, var(--text, currentColor) 76%, var(--text-muted, currentColor));
    }

    summary::marker,
    summary::-webkit-details-marker {
      display: none;
    }

    .summary-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--font-size-caption, 0.75rem);
      font-weight: var(--font-weight-semibold, 600);
      letter-spacing: var(--tracking-label, 0.04em);
      line-height: var(--line-height-tight, 1.1);
      text-transform: uppercase;
    }

    .summary-rule {
      min-width: 24px;
      height: 1px;
      background: color-mix(in oklch, var(--text-muted, currentColor) 16%, transparent);
    }

    details[open] .summary-rule {
      background: color-mix(in oklch, var(--text-muted, currentColor) 24%, transparent);
    }

    .kind-label {
      color: inherit;
      font-weight: inherit;
    }

    .summary-meta {
      display: inline-flex;
      align-items: baseline;
      justify-content: flex-end;
      min-width: 0;
      max-width: min(46vw, 360px);
      color: var(
        --ai-event-meta-color,
        var(--ai-event-meta, color-mix(in oklch, var(--text-muted, currentColor) 76%, transparent))
      );
      font-size: var(--font-size-caption, 0.75rem);
      line-height: var(--line-height-tight, 1.1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 12px;
      height: 16px;
      justify-self: end;
      color: color-mix(in oklch, var(--text-muted, currentColor) 88%, transparent);
    }

    .chevron svg {
      width: 10px;
      height: 10px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.16s ease;
    }

    details[open] .chevron svg {
      transform: rotate(90deg);
    }

    .content-shell {
      margin: 2px 0 1px;
      padding: 6px 4px 3px clamp(20px, 7vw, 58px);
    }

    .content {
      display: block;
      min-width: 0;
      max-width: 100%;
      color: var(
        --ai-event-content-color,
        color-mix(in oklch, var(--text, currentColor) 82%, var(--text-muted, currentColor))
      );
      font-size: var(--font-size-meta, 0.8125rem);
      line-height: var(--line-height-relaxed, 1.45);
    }

    .content ::slotted(*) {
      max-width: 100%;
    }

    .content ::slotted(:first-child) {
      margin-top: 0;
    }

    .content ::slotted(:last-child) {
      margin-bottom: 0;
    }

    .content ::slotted(pre) {
      overflow-x: auto;
      padding: 8px 10px;
      border-radius: var(--radius-sm, 5px);
      background: color-mix(in oklch, var(--text, currentColor) 5%, transparent);
      font-size: var(--font-size-caption, 0.75rem);
      line-height: var(--line-height-snug, 1.25);
    }

    .content ::slotted(code) {
      border-radius: 4px;
      padding: 0.08em 0.35em;
      background: color-mix(in oklch, var(--text, currentColor) 7%, transparent);
      color: color-mix(in oklch, var(--text, currentColor) 88%, var(--_accent));
      font-size: 0.94em;
    }

    :host([severity="warning"]) .summary-text {
      color: color-mix(in oklch, var(--_accent) 44%, var(--text, currentColor));
    }

    :host([severity="warning"]) .summary-rule {
      background: color-mix(in oklch, var(--_accent) 24%, transparent);
    }

    :host([severity="error"]) .summary-text {
      color: color-mix(in oklch, var(--_accent) 52%, var(--text, currentColor));
    }

    :host([severity="error"]) .summary-rule {
      background: color-mix(in oklch, var(--_accent) 30%, transparent);
    }

    :host([severity="error"]) summary:hover {
      background: color-mix(in oklch, var(--_accent) 9%, transparent);
    }

    @media (max-width: 520px) {
      summary {
        grid-template-columns: auto minmax(16px, 1fr) 12px;
        padding-right: 4px;
      }

      .summary-meta {
        grid-column: 1 / 3;
        grid-row: 2;
        justify-content: flex-start;
        max-width: 100%;
        margin-top: 1px;
      }

      .chevron {
        grid-column: 3;
        grid-row: 1 / span 2;
      }

      .content-shell {
        padding-left: 18px;
      }
    }
  `;
}
__legacyDecorateClassTS([property({ reflect: true })], AiEvent.prototype, "kind", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiEvent.prototype, "severity", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiEvent.prototype, "source", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, attribute: "for" })],
  AiEvent.prototype,
  "htmlFor",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiEvent.prototype,
  "open",
  undefined,
);
__legacyDecorateClassTS([query("details")], AiEvent.prototype, "_details", undefined);
AiEvent = __legacyDecorateClassTS([customElement("ai-event")], AiEvent);
var GAP_MAP = {
  none: "0",
  "2xs": "0.125rem",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  "2xl": "2rem",
};
var JUSTIFY_MAP = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

class AiStack extends LitElement {
  constructor() {
    super(...arguments);
    this.direction = "column";
    this.gap = "none";
    this.align = "stretch";
    this.justify = "start";
    this.wrap = false;
    this.inline = false;
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: var(--gap, 0);
      align-items: var(--align-items, stretch);
      justify-content: var(--justify-content, flex-start);
      margin: 0;
      padding: 0;
    }

    :host([inline]) {
      display: inline-flex;
    }

    :host([direction="row"]) {
      flex-direction: row;
    }

    :host([wrap]) {
      flex-wrap: wrap;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    return html` <slot></slot> `;
  }
  updated() {
    const gap = GAP_MAP[this.gap] ?? "0";
    this.style.setProperty("--gap", `var(--gap, ${gap})`);
    const alignItems = this.align;
    this.style.setProperty("--align-items", `var(--align-items, ${alignItems})`);
    const justifyContent = JUSTIFY_MAP[this.justify] ?? "flex-start";
    this.style.setProperty("--justify-content", `var(--justify-content, ${justifyContent})`);
    this.style.direction;
    this.style.gap = `var(--gap, ${gap})`;
    this.style.alignItems = `var(--align-items, ${alignItems})`;
    this.style.justifyContent = `var(--justify-content, ${justifyContent})`;
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiStack.prototype, "direction", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiStack.prototype, "gap", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiStack.prototype, "align", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiStack.prototype, "justify", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiStack.prototype,
  "wrap",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiStack.prototype,
  "inline",
  undefined,
);
AiStack = __legacyDecorateClassTS([customElement("ai-stack")], AiStack);
var RADIUS_MAP = {
  none: "0",
  sm: "0.375rem",
  md: "0.625rem",
  lg: "0.875rem",
  pill: "999px",
};

class AiSurface extends LitElement {
  constructor() {
    super(...arguments);
    this.variant = "flat";
    this.tone = "neutral";
    this.radius = "md";
    this.interactive = false;
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      margin: 0;
      padding: 0;
      border-radius: var(--border-radius, 0.625rem);
      background: var(--background-color, transparent);
      color: var(--text-color, inherit);
    }

    :host([variant="outlined"]) {
      border: var(--border-width, 1px) solid
        var(--border-color, var(--ai-color-border, rgba(128, 128, 128, 0.2)));
    }

    :host([variant="raised"]) {
      box-shadow: var(--shadow, 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08));
    }

    :host([variant="sunken"]) {
      box-shadow: var(--shadow, inset 0 1px 3px rgba(0, 0, 0, 0.12));
    }

    :host([interactive]) {
      cursor: pointer;
      transition: background 0.15s ease;
    }

    :host([interactive]:hover) {
      background: var(--hover-background-color, var(--background-color, rgba(128, 128, 128, 0.05)));
    }

    :host([interactive]:focus-visible) {
      outline: var(--focus-ring, 2px solid var(--ai-color-accent, #4a90d9));
      outline-offset: 2px;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    return html` <slot></slot> `;
  }
  updated() {
    const radius = RADIUS_MAP[this.radius] ?? "0.625rem";
    this.style.setProperty("--border-radius", `var(--border-radius, ${radius})`);
    const toneColors = this.getToneColors();
    this.style.setProperty("--background-color", `var(--background-color, ${toneColors.bg})`);
    this.style.setProperty("--text-color", `var(--text-color, ${toneColors.text})`);
    this.style.setProperty("--border-color", `var(--border-color, ${toneColors.border})`);
  }
  getToneColors() {
    switch (this.tone) {
      case "accent":
        return {
          bg: "rgba(74, 144, 217, 0.1)",
          text: "var(--ai-color-accent, #4a90d9)",
          border: "rgba(74, 144, 217, 0.3)",
        };
      case "success":
        return {
          bg: "rgba(46, 160, 67, 0.1)",
          text: "var(--ai-color-success, #2ea043)",
          border: "rgba(46, 160, 67, 0.3)",
        };
      case "warning":
        return {
          bg: "rgba(210, 153, 34, 0.1)",
          text: "var(--ai-color-warning, #d29922)",
          border: "rgba(210, 153, 34, 0.3)",
        };
      case "error":
        return {
          bg: "rgba(227, 62, 51, 0.1)",
          text: "var(--ai-color-error, #e33e33)",
          border: "rgba(227, 62, 51, 0.3)",
        };
      case "info":
        return {
          bg: "rgba(80, 160, 220, 0.1)",
          text: "var(--ai-color-info, #50a0dc)",
          border: "rgba(80, 160, 220, 0.3)",
        };
      default:
        return {
          bg: "transparent",
          text: "inherit",
          border: "var(--ai-color-border, rgba(128, 128, 128, 0.2))",
        };
    }
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiSurface.prototype, "variant", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiSurface.prototype, "tone", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiSurface.prototype, "radius", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiSurface.prototype,
  "interactive",
  undefined,
);
AiSurface = __legacyDecorateClassTS([customElement("ai-surface")], AiSurface);
var SIZE_MAP = {
  caption: "0.75rem",
  meta: "0.8125rem",
  ui: "0.875rem",
  body: "1rem",
  title: "1.125rem",
  display: "1.375rem",
};
var WEIGHT_MAP = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

class AiText extends LitElement {
  constructor() {
    super(...arguments);
    this.size = "body";
    this.weight = "normal";
    this.tone = "default";
    this.mono = false;
    this.truncate = false;
    this.inline = false;
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      margin: 0;
      padding: 0;
      font-size: var(--font-size, 1rem);
      font-weight: var(--font-weight, 400);
      line-height: var(--line-height, 1.5);
      letter-spacing: var(--letter-spacing, normal);
      color: var(--text-color, inherit);
    }

    :host([inline]) {
      display: inline-flex;
    }

    :host([mono]) {
      font-family: var(
        --font-family-mono,
        ui-monospace,
        "Cascadia Code",
        "Source Code Pro",
        Menlo,
        Consolas,
        "DejaVu Sans Mono",
        monospace
      );
    }

    :host(:not([mono])) {
      font-family: var(--font-family, inherit);
    }

    :host([truncate]) {
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    return html` <slot></slot> `;
  }
  updated() {
    const size = SIZE_MAP[this.size] ?? "1rem";
    const weight = WEIGHT_MAP[this.weight] ?? 400;
    this.style.setProperty("--font-size", `var(--font-size, ${size})`);
    this.style.setProperty("--font-weight", `var(--font-weight, ${weight})`);
    const toneColor = this.getToneColor();
    this.style.setProperty("--text-color", `var(--text-color, ${toneColor})`);
  }
  getToneColor() {
    switch (this.tone) {
      case "muted":
        return "var(--ai-color-text-muted, rgba(128, 128, 128, 0.7))";
      case "accent":
        return "var(--ai-color-accent, #4a90d9)";
      case "success":
        return "var(--ai-color-success, #2ea043)";
      case "warning":
        return "var(--ai-color-warning, #d29922)";
      case "error":
        return "var(--ai-color-error, #e33e33)";
      default:
        return "inherit";
    }
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiText.prototype, "size", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiText.prototype, "weight", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiText.prototype, "tone", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiText.prototype,
  "mono",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiText.prototype,
  "truncate",
  undefined,
);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiText.prototype,
  "inline",
  undefined,
);
AiText = __legacyDecorateClassTS([customElement("ai-text")], AiText);

class AiMarkdown extends LitElement {
  constructor() {
    super(...arguments);
    this.content = "";
    this.tone = "assistant";
    this.trusted = false;
  }
  static styles = css`
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    :host {
      display: block;
      max-width: 100%;
      color: var(--ai-markdown-color, var(--text-block-color, var(--text, var(--ai-color-text))));
      white-space: normal;
      word-break: normal;
      overflow-wrap: anywhere;
      font-size: var(--font-size-body, var(--ai-font-size-body, 0.875rem));
      line-height: var(--line-height-loose, var(--ai-line-height, 1.6));
    }

    .markdown {
      display: block;
    }

    .markdown > * + * {
      margin-top: var(--ai-markdown-gap, var(--content-gap, 10px));
    }

    p,
    ul,
    ol,
    pre,
    h1,
    h2,
    h3,
    blockquote {
      margin: 0;
    }

    p,
    li {
      white-space: pre-wrap;
    }

    h1,
    h2,
    h3 {
      line-height: var(--line-height-snug, 1.3);
      color: var(
        --ai-markdown-heading-color,
        var(--heading-color, var(--text, var(--ai-markdown-color, var(--ai-color-text))))
      );
    }

    h1 {
      font-size: var(--font-size-title, 1.125rem);
      font-weight: var(--font-weight-bold, 700);
    }

    h2 {
      font-size: var(--font-size-body, 1rem);
      font-weight: var(--font-weight-bold, 700);
    }

    h3 {
      font-size: var(--font-size-ui, 0.875rem);
      font-weight: var(--font-weight-title, 600);
    }

    ul,
    ol {
      padding-left: 1.1rem;
    }

    li {
      margin: 0;
    }

    li + li {
      margin-top: 4px;
    }

    li > ul,
    li > ol {
      margin-top: 4px;
      margin-bottom: 0;
    }

    blockquote {
      border-left: 3px solid
        var(
          --ai-markdown-border-color,
          var(--blockquote-border-color, var(--border, var(--ai-color-border, #333)))
        );
      padding-left: var(--spacing-sm, var(--ai-space-sm, 0.5rem));
      color: color-mix(
        in srgb,
        var(--text, var(--ai-markdown-color, var(--ai-color-text))) 80%,
        transparent
      );
    }

    blockquote > * + * {
      margin-top: 6px;
    }

    blockquote blockquote {
      margin-top: 6px;
    }

    code {
      padding: 0.12rem 0.35rem;
      border-radius: 6px;
      background: var(
        --ai-markdown-code-background,
        var(--code-background-color, color-mix(in srgb, var(--text, currentColor) 8%, transparent))
      );
      color: var(
        --ai-markdown-code-color,
        var(--code-text-color, var(--text, var(--ai-color-text)))
      );
      font-family: var(--font-family-mono, var(--ai-font-family-mono, monospace));
      font-size: 0.92em;
    }

    pre {
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding: calc(var(--spacing-sm, var(--ai-space-sm, 0.5rem)) + 2px)
        var(--spacing-md, var(--ai-space-md, 0.75rem));
      border-radius: calc(var(--radius, var(--ai-radius, 8px)) + 2px);
      background: var(
        --ai-markdown-code-background,
        var(--code-background-color, color-mix(in srgb, var(--text, currentColor) 5%, transparent))
      );
      border: 1px solid
        var(
          --ai-markdown-border-color,
          var(--blockquote-border-color, var(--border, var(--ai-color-border, #333)))
        );
    }

    pre code {
      padding: 0;
      border-radius: 0;
      background: transparent;
      color: inherit;
      font-size: 0.9em;
    }

    strong {
      color: var(--text, var(--ai-markdown-color, var(--ai-color-text)));
      font-weight: var(--font-weight-title, 600);
    }

    em {
      font-style: italic;
    }

    a {
      color: var(
        --ai-markdown-link-color,
        var(--link-color, var(--accent, var(--ai-color-accent, #0066cc)))
      );
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }

    a:hover {
      opacity: 0.8;
    }

    :host([tone="user"]) {
      color: var(--ai-markdown-color, var(--text-on-accent, HighlightText));
      line-height: var(--line-height-snug, 1.25);
    }

    :host([tone="user"]) .markdown > * + * {
      margin-top: 4px;
    }

    :host([tone="user"]) a {
      color: var(--ai-markdown-link-color, var(--text-on-accent, HighlightText));
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    :host([tone="user"]) blockquote {
      border-left-color: color-mix(in srgb, var(--text-on-accent, currentColor) 30%, transparent);
      color: var(--text-on-accent, currentColor);
    }

    :host([tone="user"]) code,
    :host([tone="user"]) pre {
      background: var(
        --ai-markdown-code-background,
        color-mix(in srgb, var(--text, currentColor) 12%, transparent)
      );
      border-color: var(
        --ai-markdown-border-color,
        color-mix(in srgb, var(--text, currentColor) 15%, transparent)
      );
      color: var(--ai-markdown-code-color, var(--text, currentColor));
    }

    :host([tone="user"]) th {
      background: color-mix(in srgb, var(--text, currentColor) 8%, transparent);
    }

    :host([tone="user"]) th,
    :host([tone="user"]) td {
      border-color: var(
        --ai-markdown-border-color,
        color-mix(in srgb, var(--text, currentColor) 15%, transparent)
      );
    }

    :host([tone="system"]),
    :host([tone="tool"]) {
      color: var(--ai-markdown-color, var(--text-muted, var(--ai-color-text-muted, #888)));
      font-size: var(--font-size-meta, var(--ai-font-size-meta, 0.8125rem));
    }

    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: 100%;
      min-width: max-content;
      border-collapse: collapse;
      font-size: 0.92em;
      margin: 0;
    }

    th,
    td {
      padding: var(--spacing-xs, var(--ai-space-xs, 0.25rem))
        var(--spacing-sm, var(--ai-space-sm, 0.5rem));
      border: 1px solid
        var(
          --ai-markdown-border-color,
          var(--table-border-color, var(--border, var(--ai-color-border, #333)))
        );
      text-align: left;
    }

    th {
      background: color-mix(
        in srgb,
        var(--text, var(--ai-markdown-color, var(--ai-color-text))) 4%,
        transparent
      );
      font-weight: var(--font-weight-semibold, 600);
      color: var(--text, var(--ai-markdown-color, var(--ai-color-text)));
    }

    td {
      background: transparent;
    }

    tr:nth-child(even) td {
      background: color-mix(
        in srgb,
        var(--text, var(--ai-markdown-color, var(--ai-color-text))) 2%,
        transparent
      );
    }
  `;
  parseInlines(text) {
    const parts = [];
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g;
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const token = match[0];
      const index = match.index ?? 0;
      if (index > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, index) });
      }
      if (token.startsWith("`")) {
        parts.push({ type: "code", value: token.slice(1, -1) });
      } else if (token.startsWith("**")) {
        parts.push({ type: "strong", value: token.slice(2, -2) });
      } else if (token.startsWith("[")) {
        const linkMatch = token.match(/^\[(.+)\]\((.+)\)$/);
        if (linkMatch) {
          parts.push({
            type: "link",
            text: linkMatch[1] ?? "",
            href: linkMatch[2] ?? "",
          });
        } else {
          parts.push({ type: "text", value: token });
        }
      } else if (token.startsWith("_")) {
        parts.push({ type: "emphasis", value: token.slice(1, -1) });
      } else {
        parts.push({ type: "emphasis", value: token.slice(1, -1) });
      }
      lastIndex = index + token.length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }
    return parts;
  }
  renderInline(text) {
    return map(this.parseInlines(text), (part) => {
      if (part.type === "code") {
        return html`<code>${part.value}</code>`;
      }
      if (part.type === "strong") {
        return html`<strong>${part.value}</strong>`;
      }
      if (part.type === "emphasis") {
        return html`<em>${part.value}</em>`;
      }
      if (part.type === "link") {
        const isAllowed =
          /^https?:\/\//i.test(part.href) || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(part.href);
        const safe = isAllowed ? part.href : "";
        return html`<a href="${safe}" target="_blank" rel="noopener noreferrer">${part.text}</a>`;
      }
      return part.value;
    });
  }
  parseTableRow(line) {
    const content = line.replace(/^\|/, "").replace(/\|$/, "");
    return content.split("|").map((cell) => cell.trim());
  }
  parseTableAligns(separator) {
    const cells = this.parseTableRow(separator);
    return cells.map((cell) => {
      const trimmed = cell.trim();
      const leftAlign = trimmed.startsWith(":");
      const rightAlign = trimmed.endsWith(":");
      if (leftAlign && rightAlign) {
        return "center";
      }
      if (rightAlign) {
        return "right";
      }
      return "left";
    });
  }
  isTableSeparator(line, columnCount) {
    const cells = this.parseTableRow(line);
    if (cells.length !== columnCount || cells.length === 0) {
      return false;
    }
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
  }
  indentLevel(line) {
    let n = 0;
    for (const ch of line) {
      if (ch === " ") {
        n++;
      } else if (ch === "\t") {
        n += 2;
      } else {
        break;
      }
    }
    return n;
  }
  parseBlocks(source) {
    const lines = source.replace(
      /\r\n/g,
      `
`,
    ).split(`
`);
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const trimmed = (lines[i] ?? "").trim();
      if (!trimmed) {
        i++;
        continue;
      }
      const codeBlock = this.parseCodeBlock(lines, i, trimmed);
      if (codeBlock) {
        blocks.push(codeBlock.block);
        i = codeBlock.nextIndex;
        continue;
      }
      const headingBlock = this.parseHeadingBlock(trimmed);
      if (headingBlock) {
        blocks.push(headingBlock);
        i++;
        continue;
      }
      const blockquoteBlock = this.parseBlockquoteBlock(lines, i, trimmed);
      if (blockquoteBlock) {
        blocks.push(blockquoteBlock.block);
        i = blockquoteBlock.nextIndex;
        continue;
      }
      const listBlock = this.parseListBlock(lines, i, trimmed);
      if (listBlock) {
        blocks.push(listBlock.block);
        i = listBlock.nextIndex;
        continue;
      }
      const tableBlock = this.parseTableBlock(lines, i, trimmed);
      if (tableBlock) {
        blocks.push(tableBlock.block);
        i = tableBlock.nextIndex;
        continue;
      }
      const paragraphBlock = this.parseParagraphBlock(lines, i);
      blocks.push(paragraphBlock.block);
      i = paragraphBlock.nextIndex;
    }
    return blocks;
  }
  parseCodeBlock(lines, startIndex, trimmed) {
    if (!trimmed.startsWith("```")) {
      return;
    }
    const language = trimmed.slice(3).trim();
    const codeLines = [];
    let i = startIndex + 1;
    while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
      codeLines.push(lines[i] ?? "");
      i++;
    }
    if (i < lines.length) {
      i++;
    }
    return {
      block: {
        type: "code",
        code: codeLines.join(`
`),
        language,
      },
      nextIndex: i,
    };
  }
  parseHeadingBlock(trimmed) {
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (!heading?.[1] || !heading?.[2]) {
      return;
    }
    return {
      type: "heading",
      level: heading[1].length,
      text: heading[2].trim(),
    };
  }
  parseBlockquoteBlock(lines, startIndex, trimmed) {
    if (!trimmed.startsWith(">")) {
      return;
    }
    const quoteLines = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const lineTrimmed = line.trim();
      if (!lineTrimmed) {
        let j = i + 1;
        while (j < lines.length && !(lines[j] ?? "").trim()) {
          j++;
        }
        if (j < lines.length && (lines[j] ?? "").trim().startsWith(">")) {
          quoteLines.push("");
          i = j;
          continue;
        }
        break;
      }
      if (!lineTrimmed.startsWith(">")) {
        break;
      }
      quoteLines.push(lineTrimmed.replace(/^>\s?/, ""));
      i++;
    }
    if (quoteLines.length === 0) {
      return;
    }
    const innerBlocks = this.parseBlocks(
      quoteLines.join(`
`),
    );
    return {
      block: { type: "blockquote", blocks: innerBlocks },
      nextIndex: i,
    };
  }
  parseListBlock(lines, startIndex, trimmed) {
    if (/^[-*]\s+(.+)$/.test(trimmed)) {
      return this.collectList(lines, startIndex, "ul");
    }
    if (/^\d+\.\s+(.+)$/.test(trimmed)) {
      return this.collectList(lines, startIndex, "ol");
    }
    return;
  }
  skipBlankLines(lines, from) {
    let j = from;
    while (j < lines.length && !(lines[j] ?? "").trim()) {
      j++;
    }
    return j;
  }
  parseNestedChildren(lines, startIndex, baseIndent) {
    const nestedLines = [];
    let i = startIndex;
    while (i < lines.length) {
      const nestedLine = lines[i] ?? "";
      const nestedTrimmed = nestedLine.trim();
      if (!nestedTrimmed) {
        const j = this.skipBlankLines(lines, i + 1);
        if (j < lines.length && this.indentLevel(lines[j] ?? "") > baseIndent) {
          nestedLines.push("");
          i = j;
          continue;
        }
        break;
      }
      if (this.indentLevel(nestedLine) <= baseIndent) {
        break;
      }
      nestedLines.push(nestedLine);
      i++;
    }
    if (nestedLines.length === 0) {
      return [];
    }
    const nonEmpty = nestedLines.filter((l) => l.trim());
    const minIndent =
      nonEmpty.length > 0 ? Math.min(...nonEmpty.map((l) => this.indentLevel(l))) : 0;
    const unindented = nestedLines.map((l) => (l.trim() ? l.slice(minIndent) : l));
    return this.parseBlocks(
      unindented.join(`
`),
    );
  }
  collectList(lines, startIndex, type) {
    const baseIndent = this.indentLevel(lines[startIndex] ?? "");
    const listPattern = type === "ul" ? /^[-*]\s+(.+)$/ : /^\d+\.\s+(.+)$/;
    const items = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      const indent = this.indentLevel(line);
      if (!trimmed) {
        const j = this.skipBlankLines(lines, i + 1);
        if (
          j < lines.length &&
          this.indentLevel(lines[j] ?? "") === baseIndent &&
          listPattern.test((lines[j] ?? "").trim())
        ) {
          i = j;
          continue;
        }
        break;
      }
      if (indent < baseIndent) {
        break;
      }
      if (indent === baseIndent) {
        const match = trimmed.match(listPattern);
        if (!match?.[1]) {
          break;
        }
        items.push({ text: match[1].trim(), children: [] });
        i++;
        continue;
      }
      const current = items[items.length - 1];
      if (!current) {
        break;
      }
      current.children = this.parseNestedChildren(lines, i, baseIndent);
      const consumed = this.countNestedLines(lines, i, baseIndent);
      i += consumed;
    }
    return { block: { type, items }, nextIndex: i };
  }
  countNestedLines(lines, startIndex, baseIndent) {
    let count = 0;
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      if (!trimmed) {
        const j = this.skipBlankLines(lines, i + 1);
        if (j < lines.length && this.indentLevel(lines[j] ?? "") > baseIndent) {
          count += j - i;
          i = j;
          continue;
        }
        break;
      }
      if (this.indentLevel(line) <= baseIndent) {
        break;
      }
      count++;
      i++;
    }
    return count;
  }
  parseTableBlock(lines, startIndex, trimmed) {
    if (!this.startsTable(trimmed)) {
      return;
    }
    const headers = this.parseTableRow(trimmed);
    const separator = (lines[startIndex + 1] ?? "").trim();
    if (!separator.startsWith("|") || !this.isTableSeparator(separator, headers.length)) {
      return;
    }
    const aligns = this.parseTableAligns(separator);
    const rows = [];
    let i = startIndex + 2;
    while (i < lines.length) {
      const tableLine = (lines[i] ?? "").trim();
      if (!this.startsTable(tableLine)) {
        break;
      }
      rows.push(this.parseTableRow(tableLine));
      i++;
    }
    return {
      block: { type: "table", headers, rows, aligns },
      nextIndex: i,
    };
  }
  parseParagraphBlock(lines, startIndex) {
    const paragraphLines = [];
    let i = startIndex;
    while (i < lines.length) {
      const nextTrimmed = (lines[i] ?? "").trim();
      if (!nextTrimmed || this.startsStructuredBlock(lines, i, nextTrimmed)) {
        break;
      }
      paragraphLines.push(nextTrimmed);
      i++;
    }
    return {
      block: {
        type: "paragraph",
        text: paragraphLines.join(" "),
      },
      nextIndex: i,
    };
  }
  startsStructuredBlock(lines, index, trimmed) {
    return (
      /^(#{1,3})\s+/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      trimmed.startsWith("```") ||
      trimmed.startsWith(">") ||
      this.isTableStart(lines, index, trimmed)
    );
  }
  startsTable(trimmed) {
    return trimmed.startsWith("|") && trimmed.includes("|");
  }
  isTableStart(lines, index, trimmed) {
    if (!this.startsTable(trimmed)) {
      return false;
    }
    const headers = this.parseTableRow(trimmed);
    const separator = (lines[index + 1] ?? "").trim();
    return separator.startsWith("|") && this.isTableSeparator(separator, headers.length);
  }
  renderBlocks(blocks) {
    return map(blocks, (block) => this.renderBlock(block));
  }
  renderBlock(block) {
    if (block.type === "paragraph") {
      return html`<p>${this.renderInline(block.text)}</p>`;
    }
    if (block.type === "heading") {
      if (block.level === 1) {
        return html`<h1>${this.renderInline(block.text)}</h1>`;
      }
      if (block.level === 2) {
        return html`<h2>${this.renderInline(block.text)}</h2>`;
      }
      return html`<h3>${this.renderInline(block.text)}</h3>`;
    }
    if (block.type === "code") {
      return html`<pre><code>${block.code}</code></pre>`;
    }
    if (block.type === "ul") {
      return html`<ul>
        ${map(
          block.items,
          (item) => html`<li>
            ${this.renderInline(item.text)}${item.children.length
              ? this.renderBlocks(item.children)
              : nothing}
          </li>`,
        )}
      </ul>`;
    }
    if (block.type === "ol") {
      return html`<ol>
        ${map(
          block.items,
          (item) => html`<li>
            ${this.renderInline(item.text)}${item.children.length
              ? this.renderBlocks(item.children)
              : nothing}
          </li>`,
        )}
      </ol>`;
    }
    if (block.type === "blockquote") {
      return html`<blockquote>${this.renderBlocks(block.blocks)}</blockquote>`;
    }
    if (block.type === "table") {
      return html`
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                ${map(block.headers, (header, idx) => {
                  const align = block.aligns[idx] ?? "left";
                  return html`<th style="text-align: ${align}">${this.renderInline(header)}</th>`;
                })}
              </tr>
            </thead>
            <tbody>
              ${map(
                block.rows,
                (row) => html`
                  <tr>
                    ${map(row, (cell, idx) => {
                      const align = block.aligns[idx] ?? "left";
                      return html`<td style="text-align: ${align}">${this.renderInline(cell)}</td>`;
                    })}
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      `;
    }
    return nothing;
  }
  renderMarkdown(source) {
    const blocks = this.parseBlocks(source.trim());
    return html`<div class="markdown">${this.renderBlocks(blocks)}</div>`;
  }
  render() {
    if (this.content) {
      return this.renderMarkdown(this.content);
    }
    return html` <slot></slot> `;
  }
}
__legacyDecorateClassTS([property({ type: String })], AiMarkdown.prototype, "content", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiMarkdown.prototype, "tone", undefined);
__legacyDecorateClassTS(
  [property({ type: Boolean, reflect: true })],
  AiMarkdown.prototype,
  "trusted",
  undefined,
);
AiMarkdown = __legacyDecorateClassTS([customElement("ai-markdown")], AiMarkdown);

class AiBadge extends LitElement {
  constructor() {
    super(...arguments);
    this.tone = "neutral";
    this.size = "md";
    this.dot = false;
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: var(--inline-gap, 4px);
      margin: 0;
      padding: var(--_padding, 3px 8px);
      font-size: var(--font-size, 0.75rem);
      font-weight: var(--font-weight, 600);
      line-height: 1;
      color: var(--text-color, inherit);
      background: var(--background-color, rgba(128, 128, 128, 0.1));
      border: 1px solid var(--border-color, transparent);
      border-radius: var(--border-radius, 999px);
      white-space: nowrap;
    }

    :host([size="sm"]) {
      --_padding: 2px 6px;
    }

    :host([size="md"]) {
      --_padding: 3px 8px;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dot-color, var(--text-color, inherit));
      flex-shrink: 0;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    return html`
      ${this.dot ? html` <span class="dot" part="dot"></span> ` : ""}
      <slot></slot>
    `;
  }
  updated() {
    const colors = this.getToneColors();
    this.style.setProperty("--background-color", `var(--background-color, ${colors.bg})`);
    this.style.setProperty("--text-color", `var(--text-color, ${colors.text})`);
    this.style.setProperty("--border-color", `var(--border-color, ${colors.border})`);
    this.style.setProperty("--dot-color", `var(--dot-color, ${colors.text})`);
  }
  getToneColors() {
    switch (this.tone) {
      case "accent":
        return {
          bg: "rgba(74, 144, 217, 0.12)",
          text: "var(--ai-color-accent, #4a90d9)",
          border: "rgba(74, 144, 217, 0.2)",
        };
      case "success":
        return {
          bg: "rgba(46, 160, 67, 0.12)",
          text: "var(--ai-color-success, #2ea043)",
          border: "rgba(46, 160, 67, 0.2)",
        };
      case "warning":
        return {
          bg: "rgba(210, 153, 34, 0.12)",
          text: "var(--ai-color-warning, #d29922)",
          border: "rgba(210, 153, 34, 0.2)",
        };
      case "error":
        return {
          bg: "rgba(227, 62, 51, 0.12)",
          text: "var(--ai-color-error, #e33e33)",
          border: "rgba(227, 62, 51, 0.2)",
        };
      case "info":
        return {
          bg: "rgba(80, 160, 220, 0.12)",
          text: "var(--ai-color-info, #50a0dc)",
          border: "rgba(80, 160, 220, 0.2)",
        };
      default:
        return {
          bg: "rgba(128, 128, 128, 0.1)",
          text: "inherit",
          border: "rgba(128, 128, 128, 0.15)",
        };
    }
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiBadge.prototype, "tone", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiBadge.prototype, "size", undefined);
__legacyDecorateClassTS(
  [property({ reflect: true, type: Boolean })],
  AiBadge.prototype,
  "dot",
  undefined,
);
AiBadge = __legacyDecorateClassTS([customElement("ai-badge")], AiBadge);
var SIZE_MAP2 = {
  xs: "6px",
  sm: "8px",
  md: "12px",
  lg: "16px",
};

class AiStatus extends LitElement {
  constructor() {
    super(...arguments);
    this.state = "unknown";
    this.size = "md";
    this.variant = "dot";
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 0;
      color: var(--color, var(--ai-color-text-muted, rgba(128, 128, 128, 0.7)));
    }

    .dot {
      width: var(--size, 12px);
      height: var(--size, 12px);
      border-radius: 50%;
      background: var(--color, var(--ai-color-text-muted, rgba(128, 128, 128, 0.7)));
      flex-shrink: 0;
    }

    :host([state="running"]) .dot {
      animation: pulse var(--pulse-duration, 1.5s) ease-in-out infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.2);
        opacity: 0.7;
      }
    }

    .icon-wrapper {
      width: var(--size, 12px);
      height: var(--size, 12px);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .fallback-icon {
      width: 100%;
      height: 100%;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    if (this.variant === "icon") {
      return html`
        <span class="icon-wrapper" part="icon">
          <slot>
            <svg class="fallback-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              ${this.getFallbackIconPath()}
            </svg>
          </slot>
        </span>
      `;
    }
    return html` <span class="dot" part="dot"></span> `;
  }
  updated() {
    const size = SIZE_MAP2[this.size] ?? "12px";
    this.style.setProperty("--size", `var(--size, ${size})`);
    const stateColor = this.getStateColor();
    this.style.setProperty("--color", `var(--color, ${stateColor})`);
  }
  getStateColor() {
    switch (this.state) {
      case "idle":
        return "var(--idle-color, var(--ai-color-text-muted, rgba(128, 128, 128, 0.4)))";
      case "running":
        return "var(--running-color, var(--ai-color-accent, #4a90d9))";
      case "success":
        return "var(--success-color, var(--ai-color-success, #2ea043))";
      case "error":
        return "var(--error-color, var(--ai-color-error, #e33e33))";
      case "cancelled":
        return "var(--cancelled-color, var(--ai-color-text-muted, rgba(128, 128, 128, 0.5)))";
      default:
        return "var(--ai-color-text-muted, rgba(128, 128, 128, 0.7))";
    }
  }
  getFallbackIconPath() {
    switch (this.state) {
      case "success":
        return html`
          <path
            d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
          />
        `.strings.join("");
      case "error":
        return html`
          <path
            d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
          />
        `.strings.join("");
      case "running":
        return html`
          <path
            d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9-3.25v2.5h2.5a.75.75 0 010 1.5H9v2.5a.75.75 0 01-1.5 0v-2.5H5a.75.75 0 010-1.5h2.5v-2.5a.75.75 0 011.5 0z"
          />
        `.strings.join("");
      default:
        return html` <circle cx="8" cy="8" r="4" /> `.strings.join("");
    }
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiStatus.prototype, "state", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiStatus.prototype, "size", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiStatus.prototype, "variant", undefined);
AiStatus = __legacyDecorateClassTS([customElement("ai-status")], AiStatus);
var SIZE_MAP3 = {
  sm: "1.5rem",
  md: "2rem",
  lg: "2.5rem",
};
var FONT_SIZE_MAP = {
  sm: "0.625rem",
  md: "0.75rem",
  lg: "0.875rem",
};

class AiAvatar extends LitElement {
  constructor() {
    super(...arguments);
    this.src = "";
    this.name = "";
    this.size = "md";
    this.tone = "neutral";
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--size, 2rem);
      height: var(--size, 2rem);
      border-radius: var(--border-radius, 50%);
      background: var(--background-color, rgba(128, 128, 128, 0.15));
      color: var(--text-color, inherit);
      border: 1px solid var(--border-color, transparent);
      overflow: hidden;
      flex-shrink: 0;
      margin: 0;
      padding: 0;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .initials {
      font-size: var(--font-size, 0.75rem);
      font-weight: var(--font-weight, 700);
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      user-select: none;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    if (this.src) {
      return html`<img src="${this.src}" alt="${this.name || ""}" part="image" />`;
    }
    const initials = this.getInitials();
    if (initials) {
      return html`<span class="initials" part="initials">${initials}</span>`;
    }
    return html` <slot></slot> `;
  }
  updated() {
    const size = SIZE_MAP3[this.size] ?? "2rem";
    const fontSize = FONT_SIZE_MAP[this.size] ?? "0.75rem";
    this.style.setProperty("--size", `var(--size, ${size})`);
    this.style.setProperty("--font-size", `var(--font-size, ${fontSize})`);
    const toneColors = this.getToneColors();
    this.style.setProperty("--background-color", `var(--background-color, ${toneColors.bg})`);
    this.style.setProperty("--text-color", `var(--text-color, ${toneColors.text})`);
    this.style.setProperty("--border-color", `var(--border-color, ${toneColors.border})`);
  }
  getInitials() {
    if (!this.name) {
      return "";
    }
    const words = this.name.trim().split(/\s+/);
    if (words.length >= 2) {
      const first = words[0]?.[0] ?? "";
      const last = words[words.length - 1]?.[0] ?? "";
      return (first + last).toUpperCase();
    }
    return (words[0]?.[0] ?? "").toUpperCase();
  }
  getToneColors() {
    switch (this.tone) {
      case "accent":
        return {
          bg: "rgba(74, 144, 217, 0.15)",
          text: "var(--ai-color-accent, #4a90d9)",
          border: "rgba(74, 144, 217, 0.25)",
        };
      case "user":
        return {
          bg: "rgba(74, 144, 217, 0.12)",
          text: "var(--ai-color-accent, #4a90d9)",
          border: "rgba(74, 144, 217, 0.2)",
        };
      case "assistant":
        return {
          bg: "rgba(128, 128, 128, 0.12)",
          text: "var(--ai-color-text-muted, rgba(128, 128, 128, 0.8))",
          border: "rgba(128, 128, 128, 0.2)",
        };
      case "agent":
        return {
          bg: "rgba(46, 160, 67, 0.12)",
          text: "var(--ai-color-success, #2ea043)",
          border: "rgba(46, 160, 67, 0.2)",
        };
      default:
        return {
          bg: "rgba(128, 128, 128, 0.15)",
          text: "inherit",
          border: "transparent",
        };
    }
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiAvatar.prototype, "src", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiAvatar.prototype, "name", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiAvatar.prototype, "size", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiAvatar.prototype, "tone", undefined);
AiAvatar = __legacyDecorateClassTS([customElement("ai-avatar")], AiAvatar);
var SIZE_MAP4 = {
  xs: "12px",
  sm: "14px",
  md: "16px",
  lg: "20px",
};

class AiIcon extends LitElement {
  constructor() {
    super(...arguments);
    this.size = "md";
    this.tone = "default";
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--size, 16px);
      height: var(--size, 16px);
      color: var(--color, inherit);
      margin: 0;
      padding: 0;
    }

    ::slotted(*) {
      width: 100%;
      height: 100%;
    }

    ::slotted(svg) {
      fill: currentColor;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    return html` <slot></slot> `;
  }
  updated() {
    const size = SIZE_MAP4[this.size] ?? "16px";
    this.style.setProperty("--size", `var(--size, ${size})`);
    const toneColor = this.getToneColor();
    this.style.setProperty("--color", `var(--color, ${toneColor})`);
  }
  getToneColor() {
    switch (this.tone) {
      case "muted":
        return "var(--ai-color-text-muted, rgba(128, 128, 128, 0.7))";
      case "accent":
        return "var(--ai-color-accent, #4a90d9)";
      case "success":
        return "var(--ai-color-success, #2ea043)";
      case "warning":
        return "var(--ai-color-warning, #d29922)";
      case "error":
        return "var(--ai-color-error, #e33e33)";
      default:
        return "inherit";
    }
  }
}
__legacyDecorateClassTS([property({ reflect: true })], AiIcon.prototype, "size", undefined);
__legacyDecorateClassTS([property({ reflect: true })], AiIcon.prototype, "tone", undefined);
AiIcon = __legacyDecorateClassTS([customElement("ai-icon")], AiIcon);
var TONE_OPACITY = {
  subtle: 0.08,
  default: 0.16,
  strong: 0.32,
};

class AiDivider extends LitElement {
  constructor() {
    super(...arguments);
    this.orientation = "horizontal";
    this.tone = "default";
  }
  static styles = css`
    :host {
      box-sizing: border-box;
      display: flex;
      margin: 0;
      padding: 0;
      color: var(--text-color, inherit);
    }

    :host([orientation="horizontal"]) {
      flex-direction: row;
      align-items: center;
      width: 100%;
    }

    :host([orientation="vertical"]) {
      flex-direction: column;
      justify-content: center;
      height: 100%;
      align-self: stretch;
    }

    .line {
      flex: 1;
      background: var(--line-color, rgba(128, 128, 128, 0.16));
    }

    :host([orientation="horizontal"]) .line {
      height: var(--line-width, 1px);
    }

    :host([orientation="vertical"]) .line {
      width: var(--line-width, 1px);
    }

    ::slotted(*) {
      padding: 0 var(--label-gap, 0.5rem);
      white-space: nowrap;
    }

    :host([orientation="vertical"]) ::slotted(*) {
      padding: var(--label-gap, 0.5rem) 0;
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }
  `;
  render() {
    return html`
      <span class="line" part="line-before"></span>
      <slot></slot>
      <span class="line" part="line-after"></span>
    `;
  }
  updated() {
    const opacity = TONE_OPACITY[this.tone] ?? 0.16;
    this.style.setProperty("--line-color", `var(--line-color, rgba(128, 128, 128, ${opacity}))`);
  }
}
__legacyDecorateClassTS(
  [property({ reflect: true })],
  AiDivider.prototype,
  "orientation",
  undefined,
);
__legacyDecorateClassTS([property({ reflect: true })], AiDivider.prototype, "tone", undefined);
AiDivider = __legacyDecorateClassTS([customElement("ai-divider")], AiDivider);
var nativeStyles = css`
  pre {
    margin: 0;
    max-height: 240px;
    overflow: auto;
    font-family: var(--ai-font-family-mono, monospace);
    font-size: var(--ai-font-size-caption, 0.75rem);
    white-space: pre-wrap;
  }

  a {
    color: var(--ai-color-accent, #0066cc);
    text-decoration: underline;
  }

  time {
    font-size: inherit;
  }

  button {
    cursor: pointer;
  }
`;
