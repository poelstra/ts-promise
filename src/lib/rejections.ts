/**
 * Definitely- and possibly-unhandled rejection handling.
 *
 * Copyright (C) 2017 Martin Poelstra
 * License: MIT
 */

import BaseError from "./BaseError";
import Promise from "./Promise";
import Trace from "./Trace";
import { getGlobal } from "./util";

// We don't want the full DOM typings, and will only use
// this event if it actually exists.
declare var PromiseRejectionEvent: any;

/**
 * Base class for errors thrown when a (possibly) rejected promise is detected.
 */
export class BaseUnhandledRejection extends BaseError {
	/**
	 * Original promise rejection reason.
	 */
	public reason: any;

	constructor(name: string, message: string, reason: any) {
		super(name, `${message}: ${reason}`) /* istanbul ignore next (TS emitted code) */;
		this.reason = reason;
		// In case we have a reason, and it has a stack: use it instead of our
		// own stack, as it's more helpful to see where the original error was
		// thrown, than where it was thrown inside the promise lib.
		// In case we don't have a stack, explicitly state so, to not let people
		// chase a problem in the promise lib that isn't there...
		let stack: string = this.reason && typeof this.reason === "object" && this.reason.stack;
		if (typeof stack !== "string") {
			stack = String(this.reason);
		}
		this.stack = `${this.name}: ${stack}`;
	}
}

/**
 * Thrown when a rejected promise is explicitly terminated with `.done()`.
 */
export class UnhandledRejection extends BaseUnhandledRejection {
	/**
	 * Trace of rejected promise or .done() handler.
	 */
	public trace: Trace;

	constructor(reason: any, trace: Trace) {
		super("UnhandledRejection", "unhandled rejection", reason) /* istanbul ignore next (TS emitted code) */;
		// TODO: Find a better way to merge the location of `.done()` in the
		// trace, because nobody will look for this property...
		this.trace = trace;
	}
}

/**
 * Emitted when a rejected promise isn't handled.
 * @see Promise.onPossiblyUnhandledRejection
 */
export class PossiblyUnhandledRejection extends BaseUnhandledRejection {
	/**
	 * Rejected promise.
	 */
	public promise: Promise<any>;

	constructor(promise: Promise<any>) {
		super(
			"PossiblyUnhandledRejection",
			"possibly unhandled rejection",
			promise.reason()
		) /* istanbul ignore next (TS emitted code) */;
		this.promise = promise;
	}
}

/**
 * Emit PromiseRejectionEvent (in browser environment).
 * Dispatches the event to all registered handlers, e.g.
 * - window.onunhandledrejection / window.onrejectionhandled
 * - window.addEventListener("unhandledrejection", (event) => { ... }), etc
 * Uses self in case of WebWorker.
 *
 * @param type Either "unhandledrejection" or "rejectionhandled"
 * @param reason Value used to reject promise
 * @param promise ts-promise instance
 * @return true when event was 'handled' (i.e. someone called preventDefault() on it), false otherwise
 */
function emitRejectionEvent(
	type: "unhandledrejection" | "rejectionhandled",
	reason: any,
	promise: Promise<any>
): boolean {
	// Browsers do a native Promise.resolve() on the promise given in PromiseRejectEvent,
	// which causes an unhandled rejection error due to that native promise not being handled,
	// and prevents the user's unhandled rejection handler from accessing the actual
	// ts-promise Promise. This would make the handled rejection handler useless, because that
	// gets another native promise.
	// So, prevent the unhandled rejection when constructing the event, then override the
	// property to return the 'real' promise.
	// MDN says it isn't cancelable, but both Chrome and Firefox do have it cancelable.
	const event = new PromiseRejectionEvent(type, {
		cancelable: true, // allow event.preventDefault()
		promise: true, // something that's not rejected
		reason,
	});
	Object.defineProperty(event, "promise", {
		value: promise,
	});
	const global = getGlobal();
	if (global.dispatchEvent && !global.dispatchEvent(event)) {
		// Someone called preventDefault()
		return true;
	}
	return false;
}

/**
 * Default handler for an`UnhandledRejection` error, which contains the
 * original reason of the rejection.
 * In Node, if you don't have an `unhandledException` event handler, that will cause your
 * program to terminate after printing the error.
 * When overriding the default handler, it is recommended to keep a similar behavior,
 * as your program is likely in an unknown state.
 */
export function defaultUnhandledRejectionHandler(reason: any, doneTrace: Trace): void {
	const unhandledRejection = new UnhandledRejection(reason, doneTrace);
	// Leave the comment after the throw: may show up in source line in node
	throw unhandledRejection; // Unhandled rejection caught by .done()
}

/**
 * Default handler for possibly unhandled rejection. It will:
 * - emit Node's `unhandledRejection` event if present, or
 * - emit an `unhandledrejection` (note small R) `PromiseRejectionEvent` on `window` or `self` if present, or
 * - log the rejection using `console.warn()`.
 *
 * Note: when attaching an `unhandledrejection` handler in the browser, make sure to
 * call `event.preventDefault()` to prevent ts-promise's default fallback logging.
 */
export function defaultPossiblyUnhandledRejectionHandler(promise: Promise<any>): void {
	let log = true;

	// First try to emit Node event
	if (typeof process !== "undefined" && typeof process.emit === "function") {
		// Have to cast promise to any, because current typings of process.emit() have specific
		// typings for arguments to "unhandledRejection", which say promise must be a Promise,
		// but that Promise is the built-in type.
		if (process.emit("unhandledRejection", promise.reason(), promise as any)) {
			// A handler was called
			log = false;
		}
	} else if (typeof PromiseRejectionEvent === "function") {
		// Then fire a browser event if supported by the browser
		if (emitRejectionEvent("unhandledrejection", promise.reason(), promise)) {
			log = false;
		}
	}

	// Fallback to log to console
	if (log) {
		const possiblyUnhandledRejection = new PossiblyUnhandledRejection(promise);
		// tslint:disable-next-line:no-console
		console.warn(possiblyUnhandledRejection.stack);
	}
}

/**
 * Default handler for handled rejections.
 * It will emit Node's `rejectionHandled` event if present, or emit a
 * `rejectionhandled` (note small R) event on `window` (or `self`) if present.
 */
export function defaultPossiblyUnhandledRejectionHandledHandler(promise: Promise<any>): void {
	// First try to emit Node event
	if (typeof process !== "undefined" && typeof process.emit === "function") {
		// Have to cast promise to any, because current typings of process.emit() have specific
		// typings for arguments to "rejectionHandled", which say promise must be a Promise,
		// but that Promise is the built-in type.
		process.emit("rejectionHandled", promise as any);
	} else if (typeof PromiseRejectionEvent === "function") {
		// Then fire a browser event if supported by the browser
		emitRejectionEvent("rejectionhandled", promise.reason(), promise);
	}
}
