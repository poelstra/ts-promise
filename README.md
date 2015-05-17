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
- Efficiently supports infinite recursion (with and without long stack traces)
- Early throwing of unhandled rejections with `.done()`
- No progression handlers, nor cancellation
- Optional explicit promise chain flushing, useful for test frameworks
- Readable code (not too many tricks)

For other planned features, see the TODO below.

# Usage example

Install using `npm`:
```
cd your-project
npm install --save ts-promise
```

If you're using Atom Typescript, this is all you need to get the typings working
in your project too.
Otherwise, add a `<reference path="./node_modules/ts-promise/dist/ts-promise.d.ts" />`
line to your project. Rumor has it that this is no longer necessary when TS 1.6 arrives.

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

Solid documentation is still on the TODO.

That said, the library's interface should be very unsurprising: basically ES6
Promises with some extras.

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

# TODO

Planned features (in fairly arbitrary order):
- `.promisify()`
- Possibly-unhandled-rejection detection
- Possibly-unterminated-promise-chain detection
- Differentiating between programmer errors (e.g. assertions, null derefences)
  and 'expected' errors (i.e. `.error()` support)
- `.settle()`
- Non-V8-support (should mainly be longStackTraces stuff)
- UMD support?
- Split off async callback queue and stack trace handling into separate packages
- Even simpler code (reduce duplication of 'called'-logic when resolving, maybe
  slightly simplify async callback queue)
- Better (and automated) documentation

# Development

Found an issue? Have an idea? Wanna help? Submit an issue!

```
git clone https://github.com/poelstra/ts-promise
cd ts-promise
npm install
# hack hack, code code...
npm run prepublish
```

There currently seems to be an issue with building on Windows, where my
workaround for dts-generator doesn't work. Workaround for the workaround:
(manually) replace the escape-characters ("\n" etc) in dist/ts-promise.d.ts.
A proper fix is in the works.

# Changelog

0.1.4:
- Add longStackTraces support to .done()
- Export VoidDeferred interface and allow resolving it with a Thenable<void>
- Add .toString() and .inspect()

0.1.3:
- Add Promise.defer()
- Add stack to BaseError
- Add rejection reason to UnhandledRejectionError
- 100% code coverage

0.1.2:
- Fix bundled .d.ts file for default export
- Add synchronous inspection API
- Export BaseError (to be moved to separate package later)

0.1.1:
- Transparent support for mocked timers (e.g. Sinon.useFakeTimers())

0.1.0:
- Initial version

# License

The MIT license.
