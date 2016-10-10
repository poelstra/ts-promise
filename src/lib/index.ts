/**
 * TS-Promise - fast, robust, type-safe promises
 *
 * Copyright (C) 2015 Martin Poelstra
 * License: MIT
 */

export { default, Promise, Thenable, UnhandledRejectionError, Deferred, VoidDeferred } from "./Promise";
export { default as polyfill } from "./polyfill";

// Temporary, should be moved to its own package some day
export { default as BaseError } from "./BaseError";
