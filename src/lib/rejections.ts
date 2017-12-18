/**
 * Definitely- and possibly-unhandled rejection handling.
 *
 * Copyright (C) 2017 Martin Poelstra
 * License: MIT
 */

import BaseError from "./BaseError";
import Trace from "./Trace";

/**
 * Base class for errors thrown when a (possibly) rejected promise is detected.
 */
export class BaseUnhandledRejection extends BaseError {
	/**
	 * Original promise rejection reason.
	 */
	public reason: any;

	constructor(name: string, message: string, reason: any) {
		super(name, `${message}: ${reason}`);
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
		super("UnhandledRejection", "unhandled rejection", reason);
		// TODO: Find a better way to merge the location of `.done()` in the
		// trace, because nobody will look for this property...
		this.trace = trace;
	}
}

export function defaultUnhandledRejectionHandler(reason: any, doneTrace: Trace): void {
	const unhandledRejection = new UnhandledRejection(reason, doneTrace);
	// Leave the comment after the throw: may show up in source line in node
	throw unhandledRejection; // Unhandled rejection caught by .done()
}
