// commented 12/23/2020 to get rid of livereload error on github pages  (function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function() {
    'use strict';

    function noop() {}

    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }

    function run(fn) {
        return fn();
    }

    function blank_object() {
        return Object.create(null);
    }

    function run_all(fns) {
        fns.forEach(run);
    }

    function is_function(thing) {
        return typeof thing === 'function';
    }

    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }

    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }

    function detach(node) {
        node.parentNode.removeChild(node);
    }

    function element(name) {
        return document.createElement(name);
    }

    function text(data) {
        return document.createTextNode(data);
    }

    function space() {
        return text(' ');
    }

    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }

    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }

    function children(element) {
        return Array.from(element.childNodes);
    }

    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;

    function set_current_component(component) {
        current_component = component;
    }

    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }

    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;

    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }

    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();

    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }

    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;

    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined' ?
        window :
        typeof globalThis !== 'undefined' ?
        globalThis :
        global);

    function create_component(block) {
        block && block.c();
    }

    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            } else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }

    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }

    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }

    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance ?
            instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            }) :
            [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.31.0' }, detail)));
    }

    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }

    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }

    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }

    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }

    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }

    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }

    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }

    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() {}
        $inject_state() {}
    }

    /* src\ProgressBar.svelte generated by Svelte v3.31.0 */

    const file = "src\\ProgressBar.svelte";

    function create_fragment(ctx) {
        let div2;
        let div1;
        let div0;
        let span;
        let t0;
        let t1;

        const block = {
            c: function create() {
                div2 = element("div");
                div1 = element("div");
                div0 = element("div");
                span = element("span");
                t0 = text("%");
                t1 = text( /*progress*/ ctx[0]);
                attr_dev(span, "class", "sr-only");
                add_location(span, file, 21, 6, 466);
                attr_dev(div0, "class", "progress-bar svelte-lqg9t8");
                set_style(div0, "width", /*progress*/ ctx[0] + "%");
                add_location(div0, file, 20, 4, 405);
                attr_dev(div1, "class", "progress-container svelte-lqg9t8");
                attr_dev(div1, "bp", "offset-5@md 4@md 12@sm ");
                add_location(div1, file, 19, 2, 338);
                attr_dev(div2, "bp", "grid");
                add_location(div2, file, 18, 0, 319);
            },
            l: function claim(nodes) {
                throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
            },
            m: function mount(target, anchor) {
                insert_dev(target, div2, anchor);
                append_dev(div2, div1);
                append_dev(div1, div0);
                append_dev(div0, span);
                append_dev(span, t0);
                append_dev(span, t1);
            },
            p: function update(ctx, [dirty]) {
                if (dirty & /*progress*/ 1) set_data_dev(t1, /*progress*/ ctx[0]);

                if (dirty & /*progress*/ 1) {
                    set_style(div0, "width", /*progress*/ ctx[0] + "%");
                }
            },
            i: noop,
            o: noop,
            d: function destroy(detaching) {
                if (detaching) detach_dev(div2);
            }
        };

        dispatch_dev("SvelteRegisterBlock", {
            block,
            id: create_fragment.name,
            type: "component",
            source: "",
            ctx
        });

        return block;
    }

    function instance($$self, $$props, $$invalidate) {
        let { $$slots: slots = {}, $$scope } = $$props;
        validate_slots("ProgressBar", slots, []);
        let { progress = 100 } = $$props;
        const writable_props = ["progress"];

        Object.keys($$props).forEach(key => {
            if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ProgressBar> was created with unknown prop '${key}'`);
        });

        $$self.$$set = $$props => {
            if ("progress" in $$props) $$invalidate(0, progress = $$props.progress);
        };

        $$self.$capture_state = () => ({ progress });

        $$self.$inject_state = $$props => {
            if ("progress" in $$props) $$invalidate(0, progress = $$props.progress);
        };

        if ($$props && "$$inject" in $$props) {
            $$self.$inject_state($$props.$$inject);
        }

        return [progress];
    }

    class ProgressBar extends SvelteComponentDev {
        constructor(options) {
            super(options);
            init(this, options, instance, create_fragment, safe_not_equal, { progress: 0 });

            dispatch_dev("SvelteRegisterComponent", {
                component: this,
                tagName: "ProgressBar",
                options,
                id: create_fragment.name
            });
        }

        get progress() {
            throw new Error("<ProgressBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
        }

        set progress(value) {
            throw new Error("<ProgressBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
        }
    }

    /* src\Timer.svelte generated by Svelte v3.31.0 */
    const file$1 = "src\\Timer.svelte";

    function create_fragment$1(ctx) {
        let div0;
        let h2;
        let t0;
        let t1;
        let t2;
        let progressbar;
        let t3;
        let div1;
        let button;
        let t4;
        let current;
        let mounted;
        let dispose;

        progressbar = new ProgressBar({
            props: {
                progress: /*secondsLeft*/ ctx[0] / /*totalSeconds*/ ctx[2] * 100
            },
            $$inline: true
        });

        const block = {
            c: function create() {
                div0 = element("div");
                h2 = element("h2");
                t0 = text("Seconds Left : ");
                t1 = text( /*secondsLeft*/ ctx[0]);
                t2 = space();
                create_component(progressbar.$$.fragment);
                t3 = space();
                div1 = element("div");
                button = element("button");
                t4 = text("Start");
                attr_dev(h2, "bp", "offset-5@md 4@md 12@sm");
                attr_dev(h2, "class", "svelte-11asdzk");
                add_location(h2, file$1, 50, 2, 1132);
                attr_dev(div0, "bp", "grid");
                add_location(div0, file$1, 49, 0, 1113);
                button.disabled = /*isRunning*/ ctx[1];
                attr_dev(button, "bp", "offset-5@md 4@md 12@sm");
                attr_dev(button, "class", "start svelte-11asdzk");
                add_location(button, file$1, 61, 2, 1462);
                attr_dev(div1, "bp", "grid");
                add_location(div1, file$1, 60, 0, 1443);
            },
            l: function claim(nodes) {
                throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
            },
            m: function mount(target, anchor) {
                insert_dev(target, div0, anchor);
                append_dev(div0, h2);
                append_dev(h2, t0);
                append_dev(h2, t1);
                insert_dev(target, t2, anchor);
                mount_component(progressbar, target, anchor);
                insert_dev(target, t3, anchor);
                insert_dev(target, div1, anchor);
                append_dev(div1, button);
                append_dev(button, t4);
                current = true;

                if (!mounted) {
                    dispose = listen_dev(button, "click", /*click_handler*/ ctx[4], false, false, false);
                    mounted = true;
                }
            },
            p: function update(ctx, [dirty]) {
                if (!current || dirty & /*secondsLeft*/ 1) set_data_dev(t1, /*secondsLeft*/ ctx[0]);
                const progressbar_changes = {};
                if (dirty & /*secondsLeft*/ 1) progressbar_changes.progress = /*secondsLeft*/ ctx[0] / /*totalSeconds*/ ctx[2] * 100;
                progressbar.$set(progressbar_changes);

                if (!current || dirty & /*isRunning*/ 2) {
                    prop_dev(button, "disabled", /*isRunning*/ ctx[1]);
                }
            },
            i: function intro(local) {
                if (current) return;
                transition_in(progressbar.$$.fragment, local);
                current = true;
            },
            o: function outro(local) {
                transition_out(progressbar.$$.fragment, local);
                current = false;
            },
            d: function destroy(detaching) {
                if (detaching) detach_dev(div0);
                if (detaching) detach_dev(t2);
                destroy_component(progressbar, detaching);
                if (detaching) detach_dev(t3);
                if (detaching) detach_dev(div1);
                mounted = false;
                dispose();
            }
        };

        dispatch_dev("SvelteRegisterBlock", {
            block,
            id: create_fragment$1.name,
            type: "component",
            source: "",
            ctx
        });

        return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
        let { $$slots: slots = {}, $$scope } = $$props;
        validate_slots("Timer", slots, []);
        let totalSeconds = 20;
        let secondsLeft = totalSeconds;
        let isRunning = false;

        //$: progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100;
        const dispatch = createEventDispatcher();

        function startTimer(start_value) {
            let timer = setInterval(
                () => {
                    $$invalidate(1, isRunning = true);

                    if (start_value > 0) {
                        $$invalidate(0, secondsLeft = secondsLeft - 1);
                    } else if (start_value == 0) {
                        $$invalidate(0, secondsLeft = secondsLeft + 1);
                    }

                    if (secondsLeft == 0 || secondsLeft == totalSeconds) {
                        clearInterval(timer);
                        $$invalidate(1, isRunning = false);
                        dispatch("end", "END TIMER");
                    } //secondsLeft = totalSeconds;
                },
                1000
            );
        }

        const writable_props = [];

        Object.keys($$props).forEach(key => {
            if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Timer> was created with unknown prop '${key}'`);
        });

        const click_handler = () => {
            startTimer(secondsLeft);
        };

        $$self.$capture_state = () => ({
            createEventDispatcher,
            ProgressBar,
            totalSeconds,
            secondsLeft,
            isRunning,
            dispatch,
            startTimer
        });

        $$self.$inject_state = $$props => {
            if ("totalSeconds" in $$props) $$invalidate(2, totalSeconds = $$props.totalSeconds);
            if ("secondsLeft" in $$props) $$invalidate(0, secondsLeft = $$props.secondsLeft);
            if ("isRunning" in $$props) $$invalidate(1, isRunning = $$props.isRunning);
        };

        if ($$props && "$$inject" in $$props) {
            $$self.$inject_state($$props.$$inject);
        }

        return [secondsLeft, isRunning, totalSeconds, startTimer, click_handler];
    }

    class Timer extends SvelteComponentDev {
        constructor(options) {
            super(options);
            init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

            dispatch_dev("SvelteRegisterComponent", {
                component: this,
                tagName: "Timer",
                options,
                id: create_fragment$1.name
            });
        }
    }

    /* src\HowTo.svelte generated by Svelte v3.31.0 */

    const file$2 = "src\\HowTo.svelte";

    function create_fragment$2(ctx) {
        let p;
        let t1;
        let div;
        let img;
        let img_src_value;

        const block = {
            c: function create() {
                p = element("p");
                p.textContent = "How To";
                t1 = space();
                div = element("div");
                img = element("img");
                attr_dev(p, "class", "");
                add_location(p, file$2, 6, 0, 57);
                attr_dev(img, "bp", "offset-5@md 4@md 12@sm");
                if (img.src !== (img_src_value = "Handwashing App.jpg")) attr_dev(img, "src", img_src_value);
                attr_dev(img, "alt", "How to wash your hands.");
                attr_dev(img, "class", "svelte-10t3lmq");
                add_location(img, file$2, 8, 2, 100);
                attr_dev(div, "bp", "grid");
                add_location(div, file$2, 7, 0, 81);
            },
            l: function claim(nodes) {
                throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
            },
            m: function mount(target, anchor) {
                insert_dev(target, p, anchor);
                insert_dev(target, t1, anchor);
                insert_dev(target, div, anchor);
                append_dev(div, img);
            },
            p: noop,
            i: noop,
            o: noop,
            d: function destroy(detaching) {
                if (detaching) detach_dev(p);
                if (detaching) detach_dev(t1);
                if (detaching) detach_dev(div);
            }
        };

        dispatch_dev("SvelteRegisterBlock", {
            block,
            id: create_fragment$2.name,
            type: "component",
            source: "",
            ctx
        });

        return block;
    }

    function instance$2($$self, $$props) {
        let { $$slots: slots = {}, $$scope } = $$props;
        validate_slots("HowTo", slots, []);
        const writable_props = [];

        Object.keys($$props).forEach(key => {
            if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<HowTo> was created with unknown prop '${key}'`);
        });

        return [];
    }

    class HowTo extends SvelteComponentDev {
        constructor(options) {
            super(options);
            init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

            dispatch_dev("SvelteRegisterComponent", {
                component: this,
                tagName: "HowTo",
                options,
                id: create_fragment$2.name
            });
        }
    }

    /* src\App.svelte generated by Svelte v3.31.0 */

    const { console: console_1 } = globals;
    const file$3 = "src\\App.svelte";

    function create_fragment$3(ctx) {
        let h1;
        let t1;
        let timer;
        let t2;
        let howto;
        let t3;
        let h3;
        let a0;
        let t5;
        let a1;
        let t7;
        let audio_1;
        let source;
        let source_src_value;
        let current;
        timer = new Timer({ $$inline: true });
        timer.$on("end", /*timerEnds*/ ctx[1]);
        howto = new HowTo({ $$inline: true });

        const block = {
            c: function create() {
                h1 = element("h1");
                h1.textContent = "Handwashing App";
                t1 = space();
                create_component(timer.$$.fragment);
                t2 = space();
                create_component(howto.$$.fragment);
                t3 = space();
                h3 = element("h3");
                a0 = element("a");
                a0.textContent = "Picture\n\t\tSource";
                t5 = space();
                a1 = element("a");
                a1.textContent = "Sound\n\t\tSource";
                t7 = space();
                audio_1 = element("audio");
                source = element("source");
                attr_dev(h1, "class", "svelte-9rz8mj");
                add_location(h1, file$3, 18, 0, 223);
                attr_dev(a0, "href", "https://www.who.int/docs/default-source/patient-safety/how-to-handwash-poster.pdf?sfvrsn=7004a09d_2");
                add_location(a0, file$3, 25, 1, 352);
                attr_dev(a1, "href", "https://freesound.org/people/metrostock99/sounds/345086/");
                add_location(a1, file$3, 29, 1, 487);
                attr_dev(h3, "class", "svelte-9rz8mj");
                add_location(h3, file$3, 23, 0, 289);
                if (source.src !== (source_src_value = "short_sound.wav")) attr_dev(source, "src", source_src_value);
                add_location(source, file$3, 36, 1, 649);
                add_location(audio_1, file$3, 35, 0, 622);
            },
            l: function claim(nodes) {
                throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
            },
            m: function mount(target, anchor) {
                insert_dev(target, h1, anchor);
                insert_dev(target, t1, anchor);
                mount_component(timer, target, anchor);
                insert_dev(target, t2, anchor);
                mount_component(howto, target, anchor);
                insert_dev(target, t3, anchor);
                insert_dev(target, h3, anchor);
                append_dev(h3, a0);
                append_dev(h3, t5);
                append_dev(h3, a1);
                insert_dev(target, t7, anchor);
                insert_dev(target, audio_1, anchor);
                append_dev(audio_1, source);
                /*audio_1_binding*/
                ctx[2](audio_1);
                current = true;
            },
            p: noop,
            i: function intro(local) {
                if (current) return;
                transition_in(timer.$$.fragment, local);
                transition_in(howto.$$.fragment, local);
                current = true;
            },
            o: function outro(local) {
                transition_out(timer.$$.fragment, local);
                transition_out(howto.$$.fragment, local);
                current = false;
            },
            d: function destroy(detaching) {
                if (detaching) detach_dev(h1);
                if (detaching) detach_dev(t1);
                destroy_component(timer, detaching);
                if (detaching) detach_dev(t2);
                destroy_component(howto, detaching);
                if (detaching) detach_dev(t3);
                if (detaching) detach_dev(h3);
                if (detaching) detach_dev(t7);
                if (detaching) detach_dev(audio_1);
                /*audio_1_binding*/
                ctx[2](null);
            }
        };

        dispatch_dev("SvelteRegisterBlock", {
            block,
            id: create_fragment$3.name,
            type: "component",
            source: "",
            ctx
        });

        return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
        let { $$slots: slots = {}, $$scope } = $$props;
        validate_slots("App", slots, []);
        let audio;

        function timerEnds(e) {
            console.log(e);
            audio.play();
        }

        const writable_props = [];

        Object.keys($$props).forEach(key => {
            if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<App> was created with unknown prop '${key}'`);
        });

        function audio_1_binding($$value) {
            binding_callbacks[$$value ? "unshift" : "push"](() => {
                audio = $$value;
                $$invalidate(0, audio);
            });
        }

        $$self.$capture_state = () => ({ Timer, HowTo, audio, timerEnds });

        $$self.$inject_state = $$props => {
            if ("audio" in $$props) $$invalidate(0, audio = $$props.audio);
        };

        if ($$props && "$$inject" in $$props) {
            $$self.$inject_state($$props.$$inject);
        }

        return [audio, timerEnds, audio_1_binding];
    }

    class App extends SvelteComponentDev {
        constructor(options) {
            super(options);
            init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

            dispatch_dev("SvelteRegisterComponent", {
                component: this,
                tagName: "App",
                options,
                id: create_fragment$3.name
            });
        }
    }

    const app = new App({
        target: document.body,

    });

    return app;

}());
//# sourceMappingURL=bundle.js.map