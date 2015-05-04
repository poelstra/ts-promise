/**
 * Helper utilities.
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict";

export function assert(condition: any, msg?: string): void {
	if (!condition) {
		throw new Error(msg ? "assertion failed: " + msg : "assertion failed");
	}
}
