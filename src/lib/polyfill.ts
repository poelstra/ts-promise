/**
 * Polyfill implementation.
 *
 * Copyright (C) 2016 Martin Poelstra
 * License: MIT
 */

import { Promise } from "./Promise";
import { getGlobal } from "./util";

/**
 * Polyfill global `Promise` instance with ts-promise version.
 * By default, it will only install a ts-promise version if no other
 * implementation is present. Use `force = true` to unconditionally replace the
 * promise implementation.
 *
 * Warning: in general, it's not really recommended to use polyfills, because
 * other libraries may e.g. use the fact that certain platform features are
 * absent to create a 'fingerprint' of a platform, and it may conflict with
 * other libraries that are trying to do the same thing.
 * If you're writing your own library, it's much better to simply directly
 * require/import ts-promise, and use its class directly.
 * However, if you're the 'end-user' (i.e. application, not a library), it may
 * be a viable solution to make Promises available on platforms that otherwise
 * don't have them.
 *
 * @param  {boolean}  force (Optional, default false) Forcibly overwrite existing Promise implementation with ts-promise version.
 * @return {boolean}        Returns true when global Promise is (now) a ts-promise (or derived class), false otherwise.
 */
export default function polyfill(force: boolean = false): boolean {
	// Get reference to globals (`global`, `window`, etc.)
	const global = getGlobal();
	if (!global) {
		return false;
	}
	if (force || typeof global.Promise !== "function") {
		global.Promise = Promise;
		return true;
	}
	return global.Promise instanceof Promise;
}
