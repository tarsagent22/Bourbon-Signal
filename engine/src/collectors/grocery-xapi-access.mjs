// Same public storefront fallback already used by the Arizona and Nevada collectors.
export const groceryXapiSearchKey = (env = process.env) => env.BOURBON_SIGNAL_ALBERTSONS_SEARCH_KEY || 'e914eec9448c4d5eb672debf5011cf8f';
