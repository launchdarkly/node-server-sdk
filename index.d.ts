// Type definitions for ldclient-node

/**
 * The LaunchDarkly Node.js client interface.
 *
 * Documentation: http://docs.launchdarkly.com/docs/node-sdk-reference
 */

declare module 'ldclient-node' {
  import { EventEmitter } from 'events';
  import { ClientOpts } from 'redis';

  namespace errors {
    export const LDPollingError: ErrorConstructor;
    export const LDStreamingError: ErrorConstructor;
    export const LDClientError: ErrorConstructor;
    export const LDUnexpectedResponseError: ErrorConstructor;
    export const LDInvalidSDKKeyError: ErrorConstructor;
  }

  /**
   * The LaunchDarkly static global.
   */
  export function init(key: string, options?: LDOptions): LDClient;

  /**
   * Create a feature flag store backed by a Redis instance
   */
  export function RedisFeatureStore(
    redisOpts: ClientOpts,
    cacheTTL: number,
    prefix: string,
    logger: LDLogger | object
  ): LDFeatureStore;

  /**
   * The types of values a feature flag can have.
   *
   * Flags can have any JSON-serializable value.
   */
  export type LDFlagValue = any;

  /**
   * A map of feature flags from their keys to their values.
   */
  export type LDFlagSet = {
    [key: string]: LDFlagValue;
  };

  /**
   * An object that contains the state of all feature flags, generated by the client's
   * allFlagsState() method.
   */
  export interface LDFlagsState {
    /**
     * True if this object contains a valid snapshot of feature flag state, or false if the
     * state could not be computed (for instance, because the client was offline or there
     * was no user).
     */
    valid: boolean;

    /**
     * Returns the value of an individual feature flag at the time the state was recorded.
     * It will be null if the flag returned the default value, or if there was no such flag.
     * @param key the flag key
     */
    getFlagValue: (key: string) => LDFlagValue;

    /**
     * Returns the evaluation reason for a feature flag at the time the state was recorded.
     * It will be null if reasons were not recorded, or if there was no such flag.
     * @param key the flag key
     */
    getFlagReason: (key: string) => LDEvaluationReason;
    
    /**
     * Returns a map of feature flag keys to values. If a flag would have evaluated to the
     * default value, its value will be null.
     *
     * Do not use this method if you are passing data to the front end to "bootstrap" the
     * JavaScript client. Instead, use toJson().
     */
    allValues: () => LDFlagSet;

    /**
     * Returns a Javascript representation of the entire state map, in the format used by
     * the Javascript SDK. Use this method if you are passing data to the front end in
     * order to "bootstrap" the JavaScript client.
     *
     * Do not rely on the exact shape of this data, as it may change in future to support
     * the needs of the JavaScript client.
     */
    toJSON: () => object;
  }

  /**
   * Describes the reason that a flag evaluation produced a particular value. This is
   * part of the LDEvaluationDetail object returned by variationDetail().
   */
  export type LDEvaluationReason = {
    /**
     * The general category of the reason:
     *
     * 'OFF': the flag was off and therefore returned its configured off value
     *
     * 'FALLTHROUGH': the flag was on but the user did not match any targets or rules
     *
     * 'TARGET_MATCH': the user key was specifically targeted for this flag
     *
     * 'RULE_MATCH': the user matched one of the flag's rules
     *
     * 'PREREQUISITE_FAILED': the flag was considered off because it had at least one
     * prerequisite flag that either was off or did not return the desired variation
     *
     * 'ERROR': the flag could not be evaluated, e.g. because it does not exist or due
     * to an unexpected error
     */
    kind: string;

    /**
     * A further description of the error condition, if the kind was 'ERROR'.
     */
    errorKind?: string;

    /**
     * The index of the matched rule (0 for the first), if the kind was 'RULE_MATCH'.
     */
    ruleIndex?: number;

    /**
     * The unique identifier of the matched rule, if the kind was 'RULE_MATCH'.
     */
    ruleId?: string;

    /**
     * The key of the failed prerequisite flag, if the kind was 'PREREQUISITE_FAILED'.
     */
    prerequisiteKey?: string;
  };

  /**
   * An object returned by LDClient.variationDetail(), combining the result of a feature flag
   * evaluation with information about how it was calculated.
   */
  export type LDEvaluationDetail = {
    /**
     * The result of the flag evaluation. This will be either one of the flag's variations or
     * the default value that was passed to variationDetail().
     */
    value: LDFlagValue;

    /**
     * The index of the returned value within the flag's list of variations, e.g. 0 for the
     * first variation - or null if the default value was returned.
     */
    variationIndex?: number;

    /**
     * An object describing the main factor that influenced the flag evaluation value.
     */
    reason: LDEvaluationReason;
  };

  /**
   * LaunchDarkly initialization options.
   */
  export interface LDOptions {
    /**
     * The base uri for the LaunchDarkly server.
     *
     * This is used for enterprise customers with their own LaunchDarkly instances.
     * Most users should use the default value.
     */
    baseUri?: string;

    /**
     * The stream uri for the LaunchDarkly server.
     *
     * This is used for enterprise customers with their own LaunchDarkly instances.
     * Most users should use the default value.
     */
    streamUri?: string;

    /**
     * The events uri for the LaunchDarkly server.
     *
     * This is used for enterprise customers with their own LaunchDarkly instances.
     * Most users should use the default value.
     */
    eventsUri?: string;

    /**
     * In seconds, controls the request timeout to LaunchDarkly.
     */
    timeout?: number;

    /**
     * Controls the maximum size of the event buffer. LaunchDarkly sends events asynchronously, and buffers them for efficiency.
     */
    capacity?: number;

    /**
     * Configures a logger for warnings and errors generated by the SDK.
     *
     * This can be a custom logger or an instance of winston.Logger
     */
    logger?: LDLogger | object;

    /**
     * Feature store used by the LaunchDarkly client, defaults to in memory storage.
     *
     * The SDK provides an in memory feature store as well as a redis feature store.
     */
    featureStore?: LDFeatureStore;

    /**
     * In seconds, controls how long LaunchDarkly buffers events before sending them back to our server.
     */
    flushInterval?: number;

    /**
     * In seconds, controls the time between polling requests.
     */
    pollInterval?: number;

    /**
     * Allows you to specify a host for an optional HTTP proxy.
     */
    proxyHost?: string;

    /**
     * Allows you to specify a port for an optional HTTP proxy.
     * Both the host and port must be specified to enable proxy support.
     */
    proxyPort?: string;

    /**
     * Allows you to specify basic authentication parameters for an optional HTTP proxy.
     * Usually of the form username:password.
     */
    proxyAuth?: string;

    /**
     * Whether the client should be initialized in offline mode.
     */
    offline?: boolean;

    /**
     * Whether streaming or polling should be used to receive flag updates.
     */
    stream?: boolean;

    /**
     * Whether to rely on LDD for feature updates.
     */
    useLdd?: boolean;

    /**
     * Whether to send events back to LaunchDarkly
     */
    sendEvents?: boolean;

    /**
     * Whether all user attributes (except the user key) should be marked as
     * private, and not sent to LaunchDarkly.
     *
     * Defaults to false.
     */
    allAttributesPrivate?: boolean;

    /**
     * The names of user attributes that should be marked as private, and not sent
     * to LaunchDarkly.
     *
     * Must be a list of strings. Defaults to empty list.
     */
    privateAttributeNames?: Array<string>;

    /**
     * The number of user keys that the event processor can remember at any one time,
     * so that duplicate user details will not be sent in analytics events.
     *
     * Defaults to 1000.
     */
    userKeysCapacity?: number;

    /**
     * The interval (in seconds) at which the event processor will reset its set of
     * known user keys.
     *
     * Defaults to 300.
     */
    userKeysFlushInterval?: number;
  }

  /**
   * A LaunchDarkly user object.
   */
  export interface LDUser {
    /**
     * A unique string identifying a user.
     */
    key: string;

    /**
     * The user's name.
     *
     * You can search for users on the User page by name.
     */
    name?: string;

    /**
     * The user's first name.
     */
    firstName?: string;

    /**
     * The user's last name.
     */
    lastName?: string;

    /**
     * The user's email address.
     *
     * If an `avatar` URL is not provided, LaunchDarkly will use Gravatar
     * to try to display an avatar for the user on the Users page.
     */
    email?: string;

    /**
     * An absolute URL to an avatar image for the user.
     */
    avatar?: string;

    /**
     * The user's IP address.
     *
     * If you provide an IP, LaunchDarkly will use a geolocation service to
     * automatically infer a `country` for the user, unless you've already
     * specified one.
     */
    ip?: string;

    /**
     * The country associated with the user.
     */
    country?: string;

    /**
     * Whether to show the user on the Users page in LaunchDarkly.
     */
    anonymous?: boolean;

    /**
     * Any additional attributes associated with the user.
     */
    custom?: {
      [key: string]:
        | string
        | boolean
        | number
        | Array<string | boolean | number>;
    };
  }

  /**
   * The LaunchDarkly client logger interface.
   *
   * The client will output informational debugging messages to the logger.
   * Internally, this logger defaults to an instance of winston.Logger, which takes
   * logs a variadic sequence of variables.
   * See: https://github.com/winstonjs/winston
   *
   */
  export interface LDLogger {
    /**
     * The error logger.
     *
     * @param args
     *  A sequence of any javascript variables
     */
    error: (...args: any[]) => void;

    /**
     * The warning logger.
     *
     * @param args
     *  A sequence of any javascript variables
     */
    warn: (...args: any[]) => void;

    /**
     * The info logger.
     *
     * @param args
     *  A sequence of any javascript variables
     */
    info: (...args: any[]) => void;

    /**
     * The debug logger.
     *
     * @param args
     *  A sequence of any javascript variables
     */
    debug: (...args: any[]) => void;
  }

  /**
   * The LaunchDarkly client feature store.
   *
   * The client uses this internally to store flag updates it
   * receives from LaunchDarkly.
   */
  export interface LDFeatureStore {
    /**
     * Get a flag's value.
     *
     * @param kind
     *  The type of data to be accessed
     *
     * @param key
     *  The flag key
     *
     * @param callback
     *  Will be called with the resulting flag.
     */
    get: (kind: object, key: string, callback: (res: LDFlagValue) => void) => void;

    /**
     * Get all flags.
     *
     * @param kind
     *  The type of data to be accessed
     *
     * @param callback
     *  Will be called with the resulting flag set.
     */
    all: (kind: object, callback: (res: LDFlagSet) => void) => void;

    /**
     * Initialize the store.
     *
     * @param flags
     *  Populate the store with an initial flag set.
     *
     * @param callback
     *  Will be called when the store has been initialized.
     */
    init: (flags: LDFlagSet, callback?: () => void) => void;

    /**
     * Delete a key from the store.
     *
     * @param kind
     *  The type of data to be accessed
     *
     * @param key
     *  The flag key.
     *
     * @param version
     *  The next version to increment the flag. The store should not update
     * a newer version with an older version.
     *
     * @param callback
     *  Will be called when the delete operation is complete.
     */
    delete: (kind: object, key: string, version: string, callback?: () => void) => void;

    /**
     * Upsert a flag to the store.
     *
     * @param kind
     *  The type of data to be accessed
     *
     * @param key
     *  The flag key.
     *
     * @param flag
     *  The feature flag for the corresponding key.
     *
     * @param callback
     *  Will be called after the upsert operation is complete.
     */
    upsert: (kind: object, key: string, flag: LDFlagValue, callback?: () => void) => void;

    /**
     * Is the store initialized?
     *
     * @param callback
     *  Will be called when the store is initialized.
     *
     * @returns
     *  Truthy if the cache is already initialized.
     *
     */
    initialized: (callback?: (err: any) => void) => boolean;

    /**
     * Close the feature store.
     *
     */
    close: () => void;
  }

  /**
   * The LaunchDarkly client stream processor
   *
   * The client uses this internally to retrieve updates from LaunchDarkly.
   */
  export interface LDStreamProcessor {
    start: (fn?: (err?: any) => void) => void;
    stop: () => void;
    close: () => void;
  }

  /**
   * The LaunchDarkly client feature flag requestor
   *
   * The client uses this internally to retrieve feature
   * flags from LaunchDarkly.
   */
  export interface LDFeatureRequestor {
    requestObject: (
      kind: any,
      key: string,
      cb: (err: any, body: any) => void
    ) => void;
    requestAllData: (cb: (err: any, body: any) => void) => void;
  }

  /**
   * Optional settings that can be passed to LDClient.allFlagsState().
   */
  export type LDFlagsStateOptions = {
    /**
     * True if the state should include only flags that have been marked for use with the
     * client-side SDK. By default, all flags are included.
     */
    clientSideOnly?: boolean;
    /**
     * True if evaluation reason data should be captured in the state object (see LDClient.variationDetail).
     * By default, it is not.
     */
    withReasons?: boolean;
    /**
     * True if any flag metadata that is normally only used for event generation - such as flag versions and
     * evaluation reasons - should be omitted for any flag that does not have event tracking or debugging turned on.
     * This reduces the size of the JSON data if you are passing the flag state to the front end.
     */
    detailsOnlyForTrackedFlags?: boolean;
  };

  /**
   * The LaunchDarkly client's instance interface.
   *
   * @see http://docs.launchdarkly.com/docs/js-sdk-reference
   */
  export interface LDClient extends EventEmitter {
    /**
     * @returns Whether the client library has completed initialization.
     */
    initialized: () => boolean;

    /**
     * Returns a Promise that will be resolved if and when the client is successfully initialized.
     * If initialization fails, the Promise will not resolve, but will not be rejected either
     * (unlike waitForInitialization).
     *
     * This method is deprecated and will be removed in a future release. Instead, use
     * waitForInitialization(), which waits for either success or failure.
     *
     * @returns a Promise containing the initialization state of the client
     */
    waitUntilReady: () => Promise<void>;

    /**
     * Returns a Promise that will be resolved if the client successfully initializes, or
     * rejected if client initialization has irrevocably failed (for instance, if it detects
     * that the SDK key is invalid). The success and failure cases can also be detected by listening
     * for the events "ready" and "failed".
     * @returns a Promise containing the initialization state of the client; if successful, the resolved
     * value is the same client object
     */
    waitForInitialization: () => Promise<LDClient>;

    /**
     * Retrieves a flag's value.
     *
     * @param key
     *   The key of the flag for which to retrieve the corresponding value.
     * @param user
     *   The user for the variation.
     *
     *   The variation call will automatically create a user in LaunchDarkly if a user with that user key doesn't exist already.
     *
     * @param defaultValue
     *   The value to use if the flag is not available (for example, if the
     *   user is offline or a flag is requested that does not exist).
     *
     * @param callback
     *   The callback to receive the variation result.
     *
     * @returns a Promise containing the flag value
     */
    variation: (
      key: string,
      user: LDUser,
      defaultValue: LDFlagValue,
      callback?: (err: any, res: LDFlagValue) => void
    ) => Promise<LDFlagValue>;

    /**
     * Retrieves a flag's value, along with information about how it was calculated, in the form
     * of an LDEvaluationDetail object.
     *
     * The reason property of the result will also be included in analytics events, if you are
     * capturing detailed event data for this flag.
     *
     * @param key
     *   The key of the flag for which to retrieve the corresponding value.
     * @param user
     *   The user for the variation.
     *
     *   The variation call will automatically create a user in LaunchDarkly if a user with that user key doesn't exist already.
     *
     * @param defaultValue
     *   The value to use if the flag is not available (for example, if the
     *   user is offline or a flag is requested that does not exist).
     *
     * @param callback
     *   The callback to receive the result.
     *
     * @returns a Promise containing the flag value and explanation
     */
    variationDetail: (
      key: string,
      user: LDUser,
      defaultValue: LDFlagValue,
      callback?: (err: any, res: LDEvaluationDetail) => void
    ) => Promise<LDEvaluationDetail>;

    toggle: (
      key: string,
      user: LDUser,
      defaultValue: LDFlagValue,
      callback?: (err: any, res: LDFlagValue) => void
    ) => Promise<LDFlagValue>;

    /**
     * Retrieves the set of all flag values for a user.
     *
     * This method is deprecated; use allFlagsState() instead. Current versions of the client-side
     * SDK will not generate analytics events correctly if you pass the result of allFlags().
     *
     * @param user
     * @param callback
     *   The node style callback to receive the variation result.
     * @returns a Promise containing the set of all flag values for a user
     */
    allFlags: (
      user: LDUser,
      callback?: (err: any, res: LDFlagSet) => void
    ) => Promise<LDFlagSet>;

    /**
     * Builds an object that encapsulates the state of all feature flags for a given user,
     * including the flag values and also metadata that can be used on the front end. This
     * method does not send analytics events back to LaunchDarkly.
     *
     * The most common use case for this method is to bootstrap a set of client-side
     * feature flags from a back-end service. Call the toJSON() method of the returned object
     * to convert it to the data structure used by the client-side SDK.
     *
     * @param user The end user requesting the feature flags.
     * @param options Optional object with properties that determine how the state is computed;
     *   set `clientSideOnly: true` to include only client-side-enabled flags
     * @param callback The node-style callback to receive the state result.
     * @returns a Promise containing the state object
     */
    allFlagsState: (
      user: LDUser,
      options?: LDFlagsStateOptions,
      callback?: (err: any, res: LDFlagsState) => void
    ) => Promise<LDFlagsState>;

    /**
     *
     * The secure_mode_hash method computes an HMAC signature of a user signed with the client's SDK key.
     *
     * If you're using our JavaScript SDK for client-side flags, this
     * method generates the signature you need for secure mode.
     *
     * @param user
     *
     * @returns The hash.
     */
    secureModeHash: (user: LDUser) => string;

    /**
     * Close the update processor as well as the attached feature store.
     */
    close: () => void;

    /**
     *
     * @returns Whether the client is configured in offline mode.
     */
    isOffline: () => boolean;

    /**
     * Track page events to use in goals or A/B tests.
     *
     * LaunchDarkly automatically tracks pageviews and clicks that are
     * specified in the Goals section of their dashboard. This can be used
     * to track custom goals or other events that do not currently have
     * goals.
     *
     * @param key
     *   The event to record.
     * @param user
     *   The user to track.
     * @param data
     *   Additional information to associate with the event.
     */
    track: (key: string, user: LDUser, data?: any) => void;

    /**
     * Identifies a user to LaunchDarkly.
     *
     * This only needs to be called if the user changes identities because
     * normally the user's identity is set during client initialization.
     *
     * @param user
     *   A map of user options. Must contain at least the `key` property
     *   which identifies the user.
     */
    identify: (user: LDUser) => void;

    /**
     * Flush the queue
     *
     * Internally, the LaunchDarkly SDK keeps an event queue for track and identify calls.
     * These are flushed periodically (see configuration option: flushInterval)
     * and when the queue size limit (see configuration option: capacity) is reached.
     *
     * @param callback
     *    A function which will be called when the flush completes; if omitted, you
     *    will receive a Promise instead
     *
     * @returns a Promise which resolves once flushing is finished, if you did not
     * provide a callback; note that it will be rejected if the HTTP request fails, so be
     * sure to provide a rejection handler if you are not using a callback
     */
    flush: (callback?: (err: any, res: boolean) => void) => Promise<void>;
  }
}

declare module 'ldclient-node/streaming' {
  import {
    LDOptions,
    LDFeatureRequestor,
    LDStreamProcessor
  } from 'ldclient-node';

  function StreamProcessor(
    sdkKey: string,
    options: LDOptions,
    requestor: LDFeatureRequestor
  ): LDStreamProcessor;
  export = StreamProcessor;
}
declare module 'ldclient-node/requestor' {
  import { LDOptions, LDFeatureRequestor } from 'ldclient-node';

  function Requestor(sdkKey: string, options: LDOptions): LDFeatureRequestor;
  export = Requestor;
}

declare module 'ldclient-node/feature_store' {
  import { LDFeatureStore } from 'ldclient-node';

  function InMemoryFeatureStore(): LDFeatureStore;
  export = InMemoryFeatureStore;
}
