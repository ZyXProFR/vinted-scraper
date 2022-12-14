import HttpsProxyAgent from "https-proxy-agent";
import fetch from "node-fetch";
import type { VintedSearchResult } from "../types/VintedSearchResult.js";
import ProxyHandler from "./ProxyHandler.js";
import type { VintedUser } from "../types/VintedUser.js";
import type { VintedItem } from "../types/VintedItem.js";

export default class VintedScraper {
  /**
   * Handler for proxy.
   */
  #proxyHandler?: ProxyHandler;

  /**
   * Cookie for Vinted session.
   */
  #sessionCookie?: string;

  constructor(proxies?: string[]) {
    /**
     * Check if user has given proxies.
     */
    if (proxies instanceof Array<string>) {
      this.#proxyHandler = new ProxyHandler(proxies);
    }
  }

  /**
   * Search for new products.
   *
   * @param url { string } URL to search.
   * @returns { VintedSearchResult } Result of search.
   */
  async search(url: string): Promise<VintedSearchResult> {
    const queryString = this.#getQueryParameters(url);
    return (await this.#request(`https://www.vinted.be/api/v2/catalog/items?${queryString}`)) as VintedSearchResult;
  }

  /**
   * Search for user data.
   *
   * @param id { number } ID of user.
   * @returns { VintedUser } Data of user.
   */
  async fetchUser(id: number): Promise<VintedUser> {
    return (await this.#request(`https://www.vinted.be/api/v2/users/${id}`)) as VintedUser;
  }

  /**
   * Search for item data.
   *
   * @param id { number } ID of item.
   * @returns { VintedItem } Data of item.
   */
  async fetchItem(id: number): Promise<VintedItem> {
    return (await this.#request(`https://www.vinted.de/api/v2/items/${id}`)) as VintedItem;
  }

  /**
   * Boost views of an item.
   *
   * @param url { string } Link of item to boost.
   * @param views { number } Total views to add.
   */
  async boostItem(url: string, views: number) {
    for (let i = 0; i < views; i += 1) {
      try {
        let proxy = "";

        /**
         * Get proxy if available.
         */
        if (this.#proxyHandler) {
          proxy = this.#proxyHandler.getProxy();
        }

        fetch(url, { agent: proxy !== "" ? HttpsProxyAgent(proxy) : undefined });
      } catch {
        i -= 1;
      }
    }
  }

  /**
   * Do request with default verification.
   *
   * @param url { string } URL to request.
   * @returns { Promise<VintedSearchResult | VintedUser | VintedItem> } Result.
   */
  async #request(url: string): Promise<VintedSearchResult | VintedUser | VintedItem> {
    /**
     * Fetch new session cookie if needed.
     */
    if (!this.#sessionCookie) {
      await this.#fetchSessionCookie();
    }

    let proxy = "";

    /**
     * Get proxy if available.
     */
    if (this.#proxyHandler) {
      proxy = this.#proxyHandler.getProxy();
    }

    const res = await fetch(url, {
      headers: {
        cookie: `_vinted_fr_session=${this.#sessionCookie}`,
      },
      agent: proxy !== "" ? HttpsProxyAgent(proxy) : undefined,
    });

    const text = await res.text();

    if (text.includes("Request rate limit exceeded")) {
      throw new Error("Request rate limit exceeded");
    }

    if (text.includes("<")) {
      throw new Error("Bad Gateway");
    }

    const json = JSON.parse(text);

    if (proxy !== "") json.proxy = proxy;

    if (json.message_code === "invalid_authentication_token") {
      await this.#fetchSessionCookie();
      return this.#request(url);
    }

    if (json.message_code === "not_found") {
      throw new Error("not_found");
    }

    return json;
  }

  /**
   * Get query parameters from URL.
   *
   * @param url { string } URL
   * @returns { string } Query parameters.
   */
  #getQueryParameters(url: string): string {
    const URI = decodeURI(url);

    /**
     * Check if is Vinted URI.
     */
    if (!URI.match(/^https:\/\/(www.)?vinted\.([a-z]+)\/(vetements|catalog)\?[^\s]+/)) {
      throw new Error("Invalid URI format");
    }

    /**
     * Check if URI contains a query string.
     */
    if (URI.split("?").length !== 2) {
      throw new Error("Invalid URI parameters");
    }

    const queryString = URI.split("?")[1]!
      .replaceAll("catalog[]", "catalog_id[]")
      .replaceAll("status[]", "status_id[]")
      .replaceAll("[]", "s");

    const params = queryString.split("&");
    const paramsObject: { [index: string]: string } = {};

    /**
     * Organize parameters.
     */
    params.forEach(param => {
      if (param.split("=").length !== 2) {
        throw new Error(`Invalid URI parameters: ${param}`);
      }

      if (paramsObject[param.split("=")[0] as string])
        paramsObject[param.split("=")[0] as string] += `,${param.split("=")[1]}`;
      else paramsObject[param.split("=")[0] as string] = `${param.split("=")[1]}`;
    });

    let finalParams = "";

    /**
     * Format final parameters string.
     */
    Object.keys(paramsObject!).forEach(paramObject => {
      if (paramObject !== "time") {
        if (finalParams !== "") finalParams += `&${paramObject}=${paramsObject[paramObject]}`;
        else finalParams += `${paramObject}=${paramsObject[paramObject]}`;
      }
    });

    return finalParams;
  }

  /**
   * Fetch new session cookie.
   */
  async #fetchSessionCookie() {
    let proxy = "";

    /**
     * Get proxy if available.
     */
    if (this.#proxyHandler) {
      proxy = this.#proxyHandler.getProxy();
    }

    /**
     * Request to fetch session cookie.
     */
    const res = await fetch("https://vinted.de", proxy !== "" ? { agent: HttpsProxyAgent(proxy) } : undefined);

    /**
     * Check if _vinted_fr_session cookie exists.
     */
    if (!res.headers.get("set-cookie")?.includes("_vinted_fr_session")) {
      throw new Error("Cannot fetch cookie");
    }

    /**
     * Return _vinted_fr_session cookie.
     */
    this.#sessionCookie = res.headers.get("set-cookie")?.split("_vinted_fr_session=")[1]!.split(";")[0] as string;
  }
}
