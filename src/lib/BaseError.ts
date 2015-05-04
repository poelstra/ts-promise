/**
 * Base class for custom errors.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict";

export default class BaseError implements Error {
	public name: string;
	public message: string;
	public stack: string; // provided by V8

	constructor(name: string, message: string) {
		this.name = name;
		this.message = message;
	}
}

// Make BaseError 'extend' Error, not just 'implement' Error
BaseError.prototype = Object.create(Error.prototype);
