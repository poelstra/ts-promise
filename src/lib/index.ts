/**
 * TS-Promise - fast, robust, type-safe promises
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

"use strict";

export { default, Promise, Thenable, UnhandledRejectionError, Deferred, VoidDeferred } from "./Promise";

// Temporary, should be moved to its own package some day
export { default as BaseError } from "./BaseError";
