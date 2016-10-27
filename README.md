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
- Long stack traces support (switchable at runtime!)
- [Fast](https://github.com/poelstra/ts-promise-benchmark)
- Small (gzipped minified version 0.3.1 weighs only 3.5kB, everything included)
- Efficiently supports infinite recursion (with and without long stack traces)
- Early throwing of unhandled rejections with `.done()`
- No progression handlers
- Optional explicit promise chain flushing, useful for test frameworks
- Readable code (not too many tricks)

For other planned features, see the TODO below.

# Usage example

Install using `npm`:
```
cd your-project
npm install --save ts-promise
```

If you use TypeScript, use `"moduleResolution": "node"` in your `tsconfig.json`
to let it automatically pick up the typings of this package.


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

# Docs

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
- `static setTracer(tracer: (promise: Promise<any>, msg: string) => void): void`
  Debug helper to trace promise creation, callback attaching, fullfilments, etc.
  Call with `null` to disable (default), or pass a function that's called during
  various stages in a Promise's lifecycle. Note: this function's API is likely
  going to change in the future (and may even be removed completely.)

Methods on Promise instances:
- `then<R>(onFulfilled?: (value: T) => R | Thenable<R>, onRejected?: (reason: Error) => R | Thenable<R>): Promise<R>`
  See ES6 Promise spec
- `catch<R>(onRejected?: (reason: Error) => R | Thenable<R>): Promise<R>`
  See ES6 Promise spec
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
- `toString(): string`
  Returns a human-readable representation of the promise and its status.
- `inspect(): string`
  Returns a human-readable representation of the promise and its status.
- `delay(ms: number): Promise<T>`
  Create a promise that resolves with the same value of this promise, after
  `ms` milliseconds. The timer will start when the current promise is resolved.
  If the current promise is rejected, the resulting promise is also rejected,
  without waiting for the timer.

# TODO

Planned features (in fairly arbitrary order):
- Auto-generate online docs using TypeDoc
- Replace/update the (slightly out-of-date) docs above
- Implement property-based catch() predicate (error constructor(s) and function
  already done)
- Possibly-unhandled-rejection detection
- Non-V8-support: it works in non-V8, but long stack traces aren't available
- Switch (back) to process.nextTick() / MutationObserver etc
- Implement `.promisify()`
- Simplify code somewhat more (most notably reduce duplication of 'called'-logic
  when resolving, maybe also slightly simplify async callback queue
  implementation)

Interesting ideas that need further investigation:
- Support for differentiating between programmer errors (e.g. assertions, null
  derefences) and 'expected' errors. E.g. bluebird has `.error()` and the
  concept of OperationalError, but this may not be the best way to interoperate
  with other libraries.
- Possibly-unterminated-promise-chain detection. Wild idea that could help to
  always make sure to either return a promise from a function, or properly
  terminate it, thus reducing the chance of a PossiblyUnhandledRejectionError at
  runtime.
- `.settle()` and/or other form of simply waiting for a bunch of void-promises,
  but await all of them before returning, even in case of errors. To prevent
  e.g. shutting things down while some tasks were still running.
- Split off async callback queue and stack trace handling into separate packages
  to allow re-use by other packages.

- UMD support? Submit an issue if you think this is useful to you, as I'm more
  of a browserify guy myself.


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

0.3.4 (2016-10-27):
- Make Thenable interface more compatible with TS2's ES2015 promise, to let e.g. Promise.resolve() more easily accept it.
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
