/**
 * Helper class for capturing stack traces.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict";

// TODO:
// - test/make it work in non-V8

import Stack from "./Stack";

/**
 * Stack trace container with optional source traces.
 *
 * Typically used for capturing traces across asynchronous calls (e.g.
 * with Promises or Events).
 */
export default class Trace {
	public stack: Stack;
	public sources: Stack[];

	constructor(ignoreUntil: Function = Trace) {
		this.stack = new Stack(ignoreUntil);
	}

	public static traceLimit: number = 10;

	/**
	 * Assign another Trace as the source of this Trace.
	 *
	 * Note: the stack of `source` is copied to this Trace, in order to allow
	 * truncating the trace length to `Trace.traceLimit` to prevent memory
	 * exhaustion on e.g. recursive traces.
	 *
	 * @param source Trace to use as source.
	 */
	public setSource(source: Trace): void {
		if (!source.sources) {
			this.sources = [source.stack];
		} else {
			this.sources = source.sources.concat(source.stack);
			if (this.sources.length > Trace.traceLimit) {
				this.sources = this.sources.slice(0, Trace.traceLimit);
			}
		}
	}

	public inspect(): string {
		var result = this.stack.inspect();
		if (this.sources) {
			for (var i = this.sources.length - 1; i >= 0; i--) {
				result += "\n  from previous:\n" + this.sources[i].inspect();
			}
		}
		return result;
	}
}
