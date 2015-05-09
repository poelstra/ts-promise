/**
 * Base class for custom errors.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict";

var hasStacks = (typeof (<any>Error).captureStackTrace === "function");

export default class BaseError implements Error {
	public name: string;
	public message: string;
	public stack: string; // provided by V8

	constructor(name: string, message: string) {
		this.name = name;
		this.message = message;
		/* istanbul ignore else */ // TODO: remove when testing for non-V8
		if (hasStacks) {
			(<any>Error).captureStackTrace(this, this.constructor);
		} else {
			this.stack = "dummy\n<no trace>";
		}
	}
}

// Make BaseError 'extend' Error, not just 'implement' Error
// Because Error is defined in Typescript's lib.d.ts as an interface instead of
// a class, we can't 'normally' extend it.
BaseError.prototype = Object.create(Error.prototype);
