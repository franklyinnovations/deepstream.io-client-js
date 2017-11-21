export enum EVENT {
    UNSOLICITED_MESSAGE,
    IS_CLOSED,
    MAX_RECONNECTION_ATTEMPTS_REACHED,
    CONNECTION_ERROR,
    ACK_TIMEOUT,
    UNKNOWN_CORRELATION_ID,
    HEARTBEAT_TIMEOUT,
    LISTENER_EXISTS,
    NOT_LISTENING,
    RECORD_ALREADY_DESTROYED,
    RECORD_DELETE_TIMEOUT,

    CLIENT_OFFLINE = 'client offline',
    INVALID_AUTHENTICATION_DETAILS = 'INVALID_AUTHENTICATION_DETAILS',
    CONNECTION_LOST = 'connectionLost',
    CONNECTION_REESTABLISHED = 'connectionReestablished',
    CONNECTION_STATE_CHANGED = 'connectionStateChanged',
    CLIENT_DATA_CHANGED = 'clientDataChanged',
    REAUTHENTICATION_FAILURE = 'reauthenticationFailure',
    AUTHENTICATION_TIMEOUT = 'AUTHENTICATION_TIMEOUT',

    RECORD_ERROR = 'error',
    RECORD_READY = 'ready',
    RECORD_DELETED = 'delete',
    RECORD_DISCARDED = 'discard',
    RECORD_VERSION_EXISTS = 'versionExists',
    RECORD_HAS_PROVIDER_CHANGED = 'hasProviderChanged',
    RECORD_STATE_CHANGED = 'onRecordStateChanged',

    ENTRY_ADDED_EVENT = 'entry-added',
    ENTRY_REMOVED_EVENT = 'entry-removed',
    ENTRY_MOVED_EVENT = 'entry-moved'
}

export enum CONNECTION_STATE {
    CLOSING = 'CLOSING',
    CLOSED = 'CLOSED',
    AWAITING_CONNECTION = 'AWAITING_CONNECTION',
    CHALLENGING = 'CHALLENGING',
    AWAITING_AUTHENTICATION = 'AWAITING_AUTHENTICATION',
    AUTHENTICATING = 'AUTHENTICATING',
    OPEN = 'OPEN',
    ERROR = 'ERROR',
    RECONNECTING = 'RECONNECTING',
    REDIRECTING = 'REDIRECTING',
    CHALLENGE_DENIED = 'CHALLENGE_DENIED',
    TOO_MANY_AUTH_ATTEMPTS = 'TOO_MANY_AUTH_ATTEMPTS',
    AUTHENTICATION_TIMEOUT = 'AUTHENTICATION_TIMEOUT'
}
