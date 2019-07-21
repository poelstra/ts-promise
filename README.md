<a href="https://promisesaplus.com/">
	<img src="https://promisesaplus.com/assets/logo-small.png"
		alt="Promises/A+ logo"
		title="Promises/A+ 1.1 compliant" align="right" />
</a>

[![Build Status](https://travis-ci.org/poelstra/ts-promise.svg)](https://travis-ci.org/poelstra/ts-promise)
[![Coverage Status](https://coveralls.io/repos/poelstra/ts-promise/badge.svg)](https://coveralls.io/r/poelstra/ts-promise)

# Introduction

TS-Promise is a fast, robust, type-safe promise library.

Features:
- Promises/A+ 1.1 compliant
- ES6 Promise interface compatible
- Possibly-unhandled rejection detection (can be disabled)
- Early throwing of unhandled rejections with `.done()`
- Long stack traces support (switchable at runtime!)
- [Fast](https://github.com/poelstra/ts-promise-benchmark)
- Small (gzipped minified version 2.0.0 weighs only 4kB, everything included)
- Efficiently supports infinite recursion (with and without long stack traces)
- Optional explicit promise chain flushing, useful for test frameworks
- Readable code (not too many tricks)

# Usage example

Install using `npm`:
```
cd your-project
npm install --save ts-promise
```

If you use TypeScript, use `"moduleResolution": "node"` in your `tsconfig.json`
to let it automatically pick up the typings of this package.

For use in the browser, a bundler like Webpack is recommended, but it's also
possible to use the minified version supplied in `dist/browser.min.js`.


```ts
// Example using ES6 syntax (e.g. using Typescript or Babel)

import Promise from "ts-promise";
// or e.g. var Promise = require("ts-promise").Promise;

// Hello world
Promise.resolve("hello world").then((v) => {
	console.log(v);
});

// Long stack traces demo
Promise.setLongTraces(true);
var p = Promise.resolve();
p.then(() => {
	return Promise.reject(new Error("my error"));
}).catch((e) => {
	console.error(e.stack);
});
```

Example output of the above:
```
"hello world"
Error: my error
    at /home/martin/src/promise-example/example.js:9:35
    at Promise._unwrap (/home/martin/src/ts-promise/src/lib/Promise.ts:542:20)
    at Promise._unwrapper (/home/martin/src/ts-promise/src/lib/Promise.ts:557:19)
    at CallQueue.flush (/home/martin/src/ts-promise/src/lib/async.ts:47:4)
    at Async.flush (/home/martin/src/ts-promise/src/lib/async.ts:116:19)
    at Async._scheduledFlush (/home/martin/src/ts-promise/src/lib/async.ts:95:9)
    at Object.Async._flusher [as _onImmediate] (/home/martin/src/ts-promise/src/lib/async.ts:58:50)
    at processImmediate [as _immediateCallback] (timers.js:330:15)
  from Promise at:
    at Function.Promise.reject (/home/martin/src/ts-promise/src/lib/Promise.ts:211:11)
    at /home/martin/src/promise-example/example.js:9:28
    at Promise._unwrap (/home/martin/src/ts-promise/src/lib/Promise.ts:542:20)
    at Promise._unwrapper (/home/martin/src/ts-promise/src/lib/Promise.ts:557:19)
    at CallQueue.flush (/home/martin/src/ts-promise/src/lib/async.ts:47:4)
    at Async.flush (/home/martin/src/ts-promise/src/lib/async.ts:116:19)
    at Async._scheduledFlush (/home/martin/src/ts-promise/src/lib/async.ts:95:9)
    at Object.Async._flusher [as _onImmediate] (/home/martin/src/ts-promise/src/lib/async.ts:58:50)
    at processImmediate [as _immediateCallback] (timers.js:330:15)
  from previous:
    at Promise.then (/home/martin/src/ts-promise/src/lib/Promise.ts:181:15)
    at Object.<anonymous> (/home/martin/src/promise-example/example.js:8:3)
    at Module._compile (module.js:456:26)
    at Object.Module._extensions..js (module.js:474:10)
    at Module.load (module.js:356:32)
    at Function.Module._load (module.js:312:12)
    at Function.Module.runMain (module.js:497:10)
    at startup (node.js:119:16)
    at node.js:902:3
  from previous:
    at Function.Promise.resolve (/home/martin/src/ts-promise/src/lib/Promise.ts:205:11)
    at Object.<anonymous> (/home/martin/src/promise-example/example.js:7:25)
    at Module._compile (module.js:456:26)
    at Object.Module._extensions..js (module.js:474:10)
    at Module.load (module.js:356:32)
    at Function.Module._load (module.js:312:12)
    at Function.Module.runMain (module.js:497:10)
    at startup (node.js:119:16)
    at node.js:902:3
```

# Unhandled Rejection detection

TS-Promise supports detection of (possibly) unhandled rejections.

All versions of TS-Promise support 'manually' terminating a promise chain with the `.done()`
method. If that chain resolved to a rejected promise, it will cause an `UnhandledRejection`
event.

Starting with version 2.0, promise chains that resolve to a rejected promise which is not
handled by e.g. a `.catch()` call by the end of the 'tick' will result in a `PossiblyUnhandledRejection`
event.

If that rejection is later handled (by calling `.catch()` or `.suppressUnhandledRejections()` on it),
the `PossiblyUnhandledRejectionHandled` event is raised.

For example:

```ts
const p1 = Promise.reject(new Error("oops"));
const p2 = Promise.reject(new Error("boom"));
p1.catch((err) => console.log("no problem here:", err.message));
setTimeout(
  () => {
    p2.catch((err) => console.log("now caught:", err.message));
  },
  0
);
```

Will output:

```text
no problem here: oops
PossiblyUnhandledRejection: Error: boom
    at Object.<anonymous> (/home/martin/src/ts-promise-test/catching.js:4:27)
    at Module._compile (module.js:643:30)
    at Object.Module._extensions..js (module.js:654:10)
    at Module.load (module.js:556:32)
    at tryModuleLoad (module.js:499:12)
    at Function.Module._load (module.js:491:3)
    at Function.Module.runMain (module.js:684:10)
    at startup (bootstrap_node.js:187:16)
    at bootstrap_node.js:608:3
now caught: boom
```

Note how the first rejection is caught before or within the same cycle as that it is resolved.
The second one is handled in the timeout handler, but because that will be executed in the next cycle, it will first be detected as unhandled.

To prevent this, one can use `.suppressUnhandledRejections()`, but it's not recommended to 'just silence' rejections.
Try to pass them on to calling functions, such that higher level can decide how to handle them.

## Custom unhandled rejection event handlers

Starting from version 2.0, it is possible to configure custom handlers for each of these events (see the API reference).
By default:
- `UnhandledRejection` will throw an error (which can be caught by e.g. Node's [`uncaughtException`](https://nodejs.org/api/process.html#process_event_uncaughtexception) handler).
- `PossiblyUnhandledRejection` will emit [`unhandledRejection`](https://nodejs.org/api/process.html#process_event_unhandledrejection)
 in Node, or an `unhandledrejection` event in the browser (if supported). If the event is not handled (i.e. no handlers attached in Node, or no-one called `.preventDefault()` on the event in the browser), a warning is printed on the console.
- `PossiblyUnhandledRejectionHandled` will similarly emit [`rejectionHandled`](https://nodejs.org/api/process.html#process_event_rejectionhandled)
 in Node, or an `rejectionhandled` event in the browser (if supported). However, no message will be printed if the event it unhandled.

It is recommended not to install any custom handlers for TS-Promise, but instead use the more generic mechanisms available in Node and the browser. This ensures that rejections from native promises and other promise libraries will all be handled in a consistent manner.

## Disabling unhandled rejection handling

It is possible to completely disable this behavior using e.g.:

```ts
// Disable all (possibly) unhandled rejection detection
Promise.onUnhandledRejection(false);
Promise.onPossiblyUnhandledRejection(false);
Promise.onPossiblyUnhandledRejectionHandled(false);
```

## Multiple rejections using the same reason (error)

When handling a rejection, TS-Promise only considers that specific (rejected) promise to be
handled, not all other promises being rejected with the same reason (e.g. error).

The reason for this is that such promises are indeed (sometimes subtly) different because they follow
another code path (branch), and care should be taken to handle any errors in that branch, too.

For example, consider the following contrived example:

```ts
function someFunction(p) {
  p.catch((e) => /* handle error */);
}

function otherFunction(p) {
  p.then(() => /* something */ );
  // Note: unhandled rejection!
}

const result = doSomething(); // returns rejected Promise
someFunction(result);
otherFunction(result);
```

Note how `otherFunction()` is taking a different code path, and should be handling that
rejection itself, even though it is also already handled by `someFunction()`.
(For example, consider what would happen if `someFunction()` was later removed: the
code in `otherFunction()` suddenly starts generating unhandled rejection errors, which
were not there before.)

# API

All public methods and interfaces have JSDoc comments, so if your favorite IDE
supports these, you'll have instant inline documentation.

That said, the library's interface should be very unsurprising: basically ES6
Promises with some extras.

For your convenience, here's a list of what's available on Promise.

Static methods on Promise:
- `constructor(resolver: (resolve: (value: T | Thenable<T>) => void, reject: (reason: Error) => void) => void)`
  Create a new Promise by passing a function that accepts
  resolve and reject functions. Example:
  ```ts
  var p = new Promise((resolve, reject) => {
      setTimeout(() => {
          resolve(42);
          // or e.g.: reject(new Error("boom"));
      }, 100);
  });
  ```
  See ES6 Promise spec for details.
- `static resolve<R>(value: R | Thenable<R>): Promise<R>`
  Create an immediately resolved promise (in case of a 'normal' value), or a
  promise that 'follows' another `Thenable` (e.g. a Promise from another
  library).
  See ES6 Promise spec for details.
- `static resolve(): Promise<void>`
  Convenience alias to create a `void`-Promise (for type-safety).
  See ES6 Promise spec for details.
- `static reject(reason: Error): Promise<any>`
  Create an immediately rejected promise with `reason` as its rejection value.
  See ES6 Promise spec for details.
- `static all<X>(thenables: (X | Thenable<X>)[]): Promise<X[]>`
  Create a promise that resolves to an array containing the results of resolving
  all `Thenables` ('promises') in the input array (or simply their value, if
  they're not a `Thenable`). If any of the input promises leads to a rejection,
  the output promise is rejected with the reason of the first rejected promise.
  See ES6 Promise spec for details.
- `static race<X>(thenables: (X|Thenable<X>)[]): Promise<X>`
  Create a promise that is resolved or rejected with the first resolved or
  rejected Thenable (or 'plain' value) in the array. Note: the promise will
  never resolve if the input array is empty.
- `static delay(ms: number): Promise<void>`
  Create a promise that resolves with `undefined` after `ms` milliseconds.
- `static delay<R>(value: R|Thenable<R>, ms: number): Promise<R>`
  Create a promise that resolves with given value after `ms` milliseconds.
  If `value` is a `Thenable`, the timer will start when it is resolved.
  If `value` is rejected, the resulting promise is also rejected, without
  waiting for the timer.
- `static defer<X>(): Deferred<X>`
  Return an object containing a promise and its corresponding resolve and reject
  functions. Note: most users will typically want to use the Promise constructor
  instead, as e.g. thrown errors will then automatically lead to a rejected
  promise.
- `static setLongTraces(enable: boolean): void`
  Enable or disable long stack trace support. See Example in README. Can be
  enabled and disabled at runtime, and 'traced' and 'untraced' promises can be
  mixed freely. Disabled by default, as it does incur both a performance and
  memory overhead (though still about twice as fast as Q without long traces...).
- `static flush(): void`
  Recursively flush the async callback queue until all `.then()` and `.done()`
  callbacks for fulfilled and rejected Promises have been called.
  May throw an error (e.g. `UnhandledRejectionError`). It is safe to call
  `flush()` again afterwards.
  It is an error to call `flush` while it is already running.
  Useful in e.g. unit tests to advance program state to the next 'async tick'.
- `static onUnhandledRejection(handler: boolean | UnhandledRejectionHandler): void`
  Register a callback to be called whenever a rejected Promise reaches a `.done()` call
  without `rejectHandler` argument, or either of the `.done()` callbacks itself
  throws/rejects.
  This is similar to Node's `unhandledException` event, in that it is guaranteed to be
  an error, because the programmer explicitly marked the chain with `.done()`.
  Node also has an `unhandledRejection` event, which is actually closer to ts-promise's
  `onPossiblyUnhandledRejection` handler.
  The default handler will throw an `UnhandledRejection` error, which contains the
  original reason of the rejection.
  In Node, if you don't have an `unhandledException` event handler, that will cause your
  program to terminate after printing the error.
  When overriding the default handler, it is recommended to keep a similar behavior,
  as your program is likely in an unknown state.
  Parameters:
  - `handler` Callback called with the rejection reason (typically an `Error`), and a
                 `Trace` to the `.done()` call that terminated the chain. Call e.g.
                 `trace.inspect()` to get the full trace.
                 If `true` is given, the default handler is installed.
                 If `false` is given, a no-op handler is installed.
- `static onPossiblyUnhandledRejection(handler: boolean | PossiblyUnhandledRejectionHandler): void`
  Register a callback to be called whenever a rejected Promise is not handled
  by any `.catch()` (or second argument to `.then()`) at the end of one turn of the
  event loop.
  Note that such a rejected promise may be handled later (by e.g. calling `.catch(() => {})`
  on it). In that case, a subsequent call to an `onPossiblyUnhandledRejectionHandled` callback
  will be made.
  This mechanism is equivalent to Node's `unhandledRejection` event.
  The default handler will:
  - emit Node's `unhandledRejection` event if present, or
  - emit an `unhandledrejection` (note small R) `PromiseRejectionEvent` on `window` or `self` if present, or
  - log the rejection using `console.warn()`.
  Note: when attaching an `unhandledrejection` handler in the browser, make sure to
  call `event.preventDefault()` to prevent ts-promise's default fallback logging.
  Parameters:
  - `handler` Callback called with the (so-far) unhandled rejected promise.
                 If `true` is given, the default handler is installed.
                 If `false` is given, a no-op handler is installed.
- `static onPossiblyUnhandledRejectionHandled(handler: boolean | PossiblyUnhandledRejectionHandledHandler): void`
  Register a callback to be called whenever a rejected promise previously reported as
  'possibly unhandled', now becomes handled.
  This mechanism is equivalent to Node's `rejectionHandled` event.
  The default handler will emit Node's `rejectionHandled` event if present, or emit a
  `rejectionhandled` (note small R) event on `window` (or `self`) if present.
  Parameters:
  - `handler` Callback called with a rejected promise that was previously reported as
                 'possibly unhandled'.
                 If `true` is given, the default handler is installed.
                 If `false` is given, a no-op handler is installed.
- `static setTracer(tracer: (promise: Promise<any>, msg: string) => void): void`
  Debug helper to trace promise creation, callback attaching, fullfilments, etc.
  Call with `null` to disable (default), or pass a function that's called during
  various stages in a Promise's lifecycle. Note: this function's API is likely
  going to change in the future (and may even be removed completely.)

Methods on Promise instances:
- `then<R>(onFulfilled?: (value: T) => R | Thenable<R>, onRejected?: (reason: any) => R | Thenable<R>): Promise<R>`
  Run `onFulfilled` handler when this Promise is resolved, or `onRejected` handler when this Promise is rejected.
  The resolved value or rejection value is passed as the first argument to that handler.
  The Promise returned by `.then()` is resolved/rejected with the return value/promise/error of the handler.
  See ES6 Promise spec for further details.
- `catch<R>(onRejected: (reason: any) => R | Thenable<R>): Promise<T | R>`
  `catch<R>(predicate: ErrorClass | ErrorClass[], onRejected: (reason: Error) => R | Thenable<R>): Promise<T | R>`
  `catch<R>(predicate: (reason: any) => boolean, onRejected: (reason: any) => R | Thenable<R>): Promise<T | R>`
  Run `onRejected` handler in case promise is rejected.
  The returned promise is resolved with the output of the callback, so it
  is possible to re-throw the error, but also to return a 'replacement'
  value that should be used instead.
  The first variant is equivalent to `.then(undefined, onRejected)`.
  The second variant allows to pass an error class or array of error classes
  to match (e.g. `[TypeError, RangeError]`);
  The third variant allows to pass a custom predicate function to determine
  wether to call the handler (handler is called if predicate function returns
  truthy value).
- `done<R>(onFulfilled?: (value: T) => void | Thenable<void>, onRejected?: (reason: Error) => void | Thenable<void>): void`
  `done()` behaves like `.then()` but does not return a new promise. Instead,
  it throws an `UnhandledRejectionError` when the final result of the promise
  chain is a rejected Promise (`.reason` property of the error).
  Note that it is technically safe to 'continue' the program after e.g. catching
  the error through Node's `uncaughtException`, or when running in a browser.
- `finally(handler: (result: Promise<T>) => void|Thenable<void>): Promise<T>`
  Asynchronous equivalent of try { } finally { }.
  Runs `handler` when promise resolves (fulfilled or rejected).
  Handler is passed the current promise (which is guaranteed to be
  resolved), and can be interrogated with e.g. `isFulfilled()`, `.value()`,
  etc.
  When `handler` returns `undefined` or its promise is fulfilled, the
  promise from `finally()` is resolved to the original promise's resolved
  value or rejection reason.
  If `handler` throws an error or returns a rejection, the result of
  `finally()` will be rejected with that error.
  Example:
      someLenghtyOperation().finally((result) => {
          if (result.isFulfilled()) {
              console.log("succeeded");
          } else {
              console.log("failed", result.reason());
          }
      });
- `isFulfilled(): boolean`
  Returns true when promise is fulfilled, false otherwise.
- `isRejected(): boolean`
  Returns true when promise is rejected, false otherwise.
- `isPending(): boolean`
  Returns true when promise is still pending, false otherwise.
- `value(): T`
  Returns fulfillment value if fulfilled, otherwise throws an error.
- `reason(): any`
  Returns rejection reason if rejected, otherwise throws an error.
  Note: this does not consider the rejection to be 'handled', if it is rejected. To do so, explicitly call e.g. `.suppressUnhandledRejections()`.
- `suppressUnhandledRejections(): void`
  Prevent this promise from throwing a PossiblyUnhandledRejection in case it becomes rejected. Useful when the rejection will be handled later (i.e. after the current 'tick'), or when the rejection is to be ignored completely.
  This is equivalent to calling `.catch(() => {})`, but more efficient.
  Note: any derived promise (e.g. by calling `.then(cb)`) causes a new promise to be created, which can still cause the rejection to be thrown.
  Note: if the rejection was already notified, the rejection-handled handler will be called.
- `toString(): string`
  Returns a human-readable representation of the promise and its status.
- `inspect(): string`
  Returns a human-readable representation of the promise and its status.
- `delay(ms: number): Promise<T>`
  Create a promise that resolves with the same value of this promise, after
  `ms` milliseconds. The timer will start when the current promise is resolved.
  If the current promise is rejected, the resulting promise is also rejected,
  without waiting for the timer.

# Development

Found an issue? Have an idea? Wanna help? Submit an issue!

```
git clone https://github.com/poelstra/ts-promise
cd ts-promise
npm install
# hack hack, code code...
npm run prepublish
```

# Changelog

Notable changes listed below, for details see the version tags in Git.

2.2.0 (2018-07-21):
- Improve compatibility with native Promise (through e.g. `PromiseLike`) with newer TypeScript definitions
- Update to TypeScript 3.5.3

2.1.0 (2018-08-20):
- Improve compatibility with native Promise (through e.g. `PromiseLike`) in strictNullChecks mode
- Update to Typescript 3.0.1
- Compile using strict mode

2.0.0 (2018-05-26):
- Implement PossiblyUnhandledRejection detection
  - Emits `unhandledRejection` event in Node, `unhandledrejection` in browser to handle these for all promise libraries
  - Can be overridden and disabled (see section in Readme for more info)
  - Logs message if not handled in node or browser
- Update to Typescript 2.7.2

1.0.0 (2017-11-22):
- It's production-ready for a long time, so let's call it that way.
- Change type of argument to catch callbacks to `any` (instead of `Error`) because rejections (e.g. from other
  libs) could actually be non-Errors. No functional changes (code handled that just fine already) (#15, thanks @sgrtho!)
- Fix Error subclasses on recent TypeScript + Node, also enables stack traces on more platforms (#14, thanks @mgroenhoff!)

0.3.4 (2016-10-27):
- Make Thenable interface more compatible with TS2's ES2015 promise, to let e.g. `Promise.resolve()` more easily accept it.
- Optimize `Promise#return()` (without argument): very common case when converting a `Promise<X>` to a `Promise<void>`.

0.3.3 (2016-10-18):
- Fix unnecessary dependency on node typings in generated type definitions,
  broke some builds (#13)

0.3.2 (2016-10-10):
- Fix TS2 not finding ts-promise typings
- Switch to `@types` typings

0.3.1 (2016-08-17):
- Add opt-in `polyfill()`
- Add experimental minified build (`dist/browser.min.js`)
- Upgrade dev dependencies

0.3.0 (2016-02-26):
- Switch to `"moduleResolution": "node"`-compatible typings
  - To use these typings, simply put that setting in your `tsconfig.json` and
    remove the (manual) reference to the ts-promise.d.ts file from your project.
- Update to latest Typescript (1.8.2)
- Update to latest TSLint, fix linting errors
- `async.setScheduler()` now uses `undefined` (instead of `null`) to reset,
  but the old behaviour still works (though deprecated)

0.2.5 (2016-02-08):
- Replace previous `setImmediate` hack with non-global-polluting one (#8)

0.2.4 (2016-01-30):
- Stub `setImmediate` in case of browserify'ed environment (#8)

0.2.3 (2015-08-27):
- Fix stack overflow for very long unresolved promise chains
- Simplify and document internal unwrapping logic

0.2.2 (2015-08-04):
- Implement `.finally()` (#3)
- Add `Inspection<T>` interface (#4)
- Don't confuse users by showing our internal stack trace when Node didn't provide one for UnhandledRejectionError

0.2.1 (2015-06-24):
- Improve stack trace for UnhandledRejectionError
- Allow specifying Error classes with different constructor arguments in `.catch()`

0.2.0 (2015-06-23):
- Allow passing predicate to `.catch()` (Error class or array of them, or a
  custom matching function)
- Add `.return()` and `.throw()` helpers
- Document all public members of Promise and UnhandledRejectionError
- Stricter typing for `Promise.reject()`, no longer returns `Promise<any>` by
  default
- Require `.then()` and `.catch()` to have first callback (for typing only,
  implementation supports full Promises/A+)
- Include .ts sources to not confuse debugger due to sourcemaps also being
  included
- Fix building on Windows

0.1.5  (2015-05-17):
- Add Promise.race()
- Add .delay() on Promise and instance

0.1.4  (2015-05-13):
- Add longStackTraces support to .done()
- Export VoidDeferred interface and allow resolving it with a Thenable<void>
- Add .toString() and .inspect()

0.1.3  (2015-05-09):
- Add Promise.defer()
- Add stack to BaseError
- Add rejection reason to UnhandledRejectionError
- 100% code coverage

0.1.2 (2015-05-07):
- Fix bundled .d.ts file for default export
- Add synchronous inspection API
- Export BaseError (to be moved to separate package later)

0.1.1 (2015-05-06):
- Transparent support for mocked timers (e.g. Sinon.useFakeTimers())

0.1.0 (2015-05-04):
- Initial version

# License

The MIT license.
