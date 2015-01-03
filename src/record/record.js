var JsonPath = require( './json-path' ),
	utils = require( '../utils/utils' ),
	EventEmitter = require( 'component-emitter' ),
	C = require( '../constants/constants' ),
	messageBuilder = require( '../message/message-builder' ),
	messageParser = require( '../message/message-parser' ),
	ALL_EVENT = 'ALL_EVENT';

/**
 * This class represents a single record - an observable
 * dataset returned by client.record.getRecord()
 *
 * @extends {EventEmitter}
 *
 * @param {String} name          		The unique name of the record
 * @param {Object} recordOptions 		A map of options, e.g. { persist: true }
 * @param {Connection} Connection		The instance of the server connection
 * @param {Object} options				Deepstream options
 *
 * @constructor
 */
var Record = function( name, recordOptions, connection, options ) {
	this.name = name;
	this._recordOptions = recordOptions;
	this._connection = connection;
	//TODO resubscribe on reconnect
	this._options = options;
	this.isReady = false;
	this._$data = {};
	this._version = null;
	this._paths = {};
	this._oldValue = null;
	this._oldPathValues = null;
	this._eventEmitter = new EventEmitter();
	this.__deleteAckTimeout = null;
	this._readAckTimeout = setTimeout( this._onTimeout.bind( this, C.EVENT.ACK_TIMEOUT ), this._options.recordReadAckTimeout );
	this._readTimeout = setTimeout( this._onTimeout.bind( this, C.EVENT.RESPONSE_TIMEOUT ), this._options.recordReadTimeout );
	this._connection.sendMsg( C.TOPIC.RECORD, C.ACTIONS.CREATEORREAD, [ this.name ] );
};

EventEmitter( Record.prototype );

/**
 * Returns a copy of either the entire dataset of the record
 * or - if called with a path - the value of that path within
 * the record's dataset.
 *
 * Returning a copy rather than the actual value helps to prevent
 * the record getting out of sync due to unintentional changes to
 * its data
 *
 * @param   {[String]} path A JSON path, e.g. users[ 2 ].firstname
 *
 * @public
 * @returns {Mixed} value
 */
Record.prototype.get = function( path ) {
	var value;

	if( path ) {
		value = this._getPath( path ).getValue();
	} else {
		value = this._$data;
	}

	return utils.shallowCopy( value );
};

/**
 * Sets the value of either the entire dataset
 * or of a specific path within the record
 * and submits the changes to the server
 *
 * If the new data is equal to the current data, nothing will happen
 *
 * @param {[String|Object]} pathOrData Either a JSON path when called with two arguments or the data itself
 * @param {Object} data     The data that should be stored in the record
 *
 * @public
 * @returns {void}
 */
Record.prototype.set = function( pathOrData, data ) {
	if( !this.isReady ) {
		this.emit( 'error', 'Can\'t set record data for ' + this._name + '. Record not ready yet' );
		return;
	}

	if( arguments.length === 2 && utils.deepEquals( this._getPath( pathOrData ).getValue(), data ) ) {
		return;
	}
	else if( arguments.length === 1 && utils.deepEquals( this._$data, pathOrData ) ) {
		return;
	}

	this._beginChange();
	this._version++;

	if( arguments.length === 1 ) {
		this._$data = pathOrData;
		this._connection.sendMsg( C.TOPIC.RECORD, C.ACTIONS.UPDATE, [
			this.name, 
			this._version, 
			this._$data 
		]);
	} else {
		this._getPath( pathOrData ).setValue( data );
		this._connection.sendMsg( C.TOPIC.RECORD, C.ACTIONS.PATCH, [ 
			this.name, 
			this._version, 
			pathOrData, 
			messageBuilder.typed( data ) 
		]);
	}

	this._completeChange();
};

/**
 * Subscribes to changes to the records dataset.
 *
 * Callback is the only mandatory argument.
 *
 * When called with a path, it will only subscribe to updates
 * to that path, rather than the entire record
 *
 * If called with true for triggerNow, the callback will
 * be called immediatly with the current value
 *
 * @param   {[String]}		path			A JSON path within the record to subscribe to
 * @param   {Function} 		callback       	Callback function to notify on changes
 * @param   {[Boolean]}		triggerNow      A flag to specify whether the callback should be invoked immediatly
 *                                       	with the current value
 *
 * @public
 * @returns {void}
 */
Record.prototype.subscribe = function( path, callback, triggerNow ) {
	var i, args = this._normalizeArguments( arguments );

	this._eventEmitter.on( args.path || ALL_EVENT, args.callback );

	if( args.triggerNow && this.isReady ) {
		if( args.path ) {
			args.callback( this._getPath( args.path ).getValue() );
		} else {
			args.callback( this._$data );
		}
	}
};

/**
 * Removes a subscription that was previously made using record.subscribe()
 *
 * Can be called with a path to remove the callback for this specific
 * path or only with a callback which removes it from the generic subscriptions
 *
 * Please Note: unsubscribe is a purely client side operation. If the app is no longer
 * interested in receiving updates for this record from the server it needs to call
 * discard instead
 *
 * @param   {[String|Function]}   pathOrCallback A JSON path
 * @param   {Function} 			  callback   	The callback method. Please note, if a bound method was passed to
 *                                	   			subscribe, the same method must be passed to unsubscribe as well.
 *
 * @public
 * @returns {void}
 */
Record.prototype.unsubscribe = function( pathOrCallback, callback ) {
	var event = arguments.length === 2 ? pathOrCallback : ALL_EVENT;
	this._eventEmitter.off( event, callback );
};

/**
 * Removes all change listener and notifies the server that the client is
 * no longer interested in updates for this record
 *
 * TODO - only actually discard if this is the last place this record is used in
 *
 * @public
 * @returns {void}
 */
Record.prototype.discard = function() {
	this._eventEmitter.off();
	//@TODO send discard message
};

/**
 * Deletes the record on the server.
 *
 * TODO - discard / unsubscribe?
 * 
 * @public
 * @returns {void}
 */
Record.prototype.delete = function() {
	this._deleteAckTimeout = setTimeout( this._onTimeout.bind( this, C.EVENT.DELETE_TIMEOUT ), this._options.recordDeleteTimeout );
	this._connection.sendMsg( C.TOPIC.RECORD, C.ACTIONS.DELETE, [ this.name ] );
};

/**
 * Callback for incoming messages from the message handler
 *
 * @param   {Object} message parsed and validated deepstream message
 *
 * @package private
 * @returns {void}
 */
Record.prototype._$onMessage = function( message ) {
	if( message.action === C.ACTIONS.READ ) {
		this._clearTimeouts();
		this._onRead( message );
	}
	else if( message.action === C.ACTIONS.ACK ) {
		this._processAckMessage( message );
	}
	else if( message.action === C.ACTIONS.UPDATE || message.action === C.ACTIONS.PATCH ) {
		this._applyUpdate( message );
	}
};

/**
 * Callback for ack-messages. Acks can be received for
 * subscriptions, discards and deletes
 *
 * @param   {Object} message parsed and validated deepstream message
 *
 * @private
 * @returns {void}
 */
Record.prototype._processAckMessage = function( message ) {
	var acknowledgedAction = message.data[ 0 ];
	
	if( acknowledgedAction === C.ACTIONS.SUBSCRIBE ) {
		clearTimeout( this._readAckTimeout );
	}

	else if( acknowledgedAction === C.ACTIONS.DELETE ) {
		clearTimeout( this._deleteAckTimeout );
		this.emit( 'deleted' );
	}
};

/**
 * Applies incoming updates and patches to the record's dataset
 *
 * @param   {Object} message parsed and validated deepstream message
 *
 * @private
 * @returns {void}
 */
Record.prototype._applyUpdate = function( message ) {
	var version = parseInt( message.data[ 1 ], 10 );

	if( this._version + 1 !== version ) {
		//TODO - handle gracefully and retry / merge
		this.emit( 'error', 'received update for ' + version + ' but version is ' + this._version );
	}
	this._beginChange();
	this._version = version;

	if( message.action === C.ACTIONS.UPDATE ) {
		this._$data = JSON.parse( message.data[ 2 ] );
	} else {
		this._getPath( message.data[ 2 ] ).setValue( messageParser.convertTyped( message.data[ 3 ] ) );
	}

	this._completeChange();
};

/**
 * Callback for incoming read messages
 * 
 * @param   {Object} message parsed and validated deepstream message
 *
 * @private
 * @returns {void}
 */
Record.prototype._onRead = function( message ) {
	this._beginChange();
	this._version = parseInt( message.data[ 1 ], 10 );
	this._$data = JSON.parse( message.data[ 2 ] );
	this.isReady = true;
	this.emit( 'ready' );
	this._completeChange();
};

/**
 * Returns an instance of JsonPath for a specific path. Creates the instance if it doesn't
 * exist yet
 *
 * @param   {String} path
 *
 * @returns {JsonPath}
 */
Record.prototype._getPath = function( path ) {
	if( !this._paths[ path ] ) {
		this._paths[ path ] = new JsonPath( this, path );
	}

	return this._paths[ path ];
};

/**
 * First of two steps that are called for incoming and outgoing updates.
 * Saves the current value of all paths the app is subscribed to.
 *
 * @private
 * @returns {void}
 */
Record.prototype._beginChange = function() {
	if( !this._eventEmitter._callbacks ) {
		return;
	}

	var paths = Object.keys( this._eventEmitter._callbacks ),
		i;

	this._oldPathValues = {};

	if( this._eventEmitter.hasListeners( ALL_EVENT ) ) {
		this._oldValue = this.get();
	}

	for( i = 0; i < paths.length; i++ ) {
		this._oldPathValues[ paths[ i ] ] = this._getPath( paths[ i ] ).getValue();
	}
};

/**
 * Second of two steps that are called for incoming and outgoing updates.
 * Compares the new values for every path with the previously stored ones and
 * updates the subscribers if the value has changed
 *
 * @private
 * @returns {void}
 */
Record.prototype._completeChange = function() {
	if( this._eventEmitter.hasListeners( ALL_EVENT ) && !utils.deepEquals( this._oldValue, this._$data ) ) {
		this._eventEmitter.emit( ALL_EVENT, this.get() );
	}

	this._oldValue = null;
	
	if( this._oldPathValues === null ) {
		return;
	}

	var path, currentValue;

	for( path in this._oldPathValues ) {
		currentValue = this._getPath( path ).getValue();

		if( currentValue !== this._oldPathValues[ path ] ) {
			this._eventEmitter.emit( path, currentValue );
		}
	}

	this._oldPathValues = null;
};

/**
 * Creates a map based on the types of the provided arguments
 *
 * @param {Arguments} args
 *
 * @private
 * @returns {Object} arguments map
 */
Record.prototype._normalizeArguments = function( args ) {
	var result = {};

	// If arguments is already a map of normalized parameters
	// (e.g. when called by AnonymousRecord), just return it.
	if( args.length === 1 && typeof args[ 0 ] === 'object' ) {
		return args[ 0 ];
	}

	for( i = 0; i < args.length; i++ ) {
		if( typeof args[ i ] === 'string' ) {
			result.path = args[ i ];
		}
		else if( typeof args[ i ] === 'function' ) {
			result.callback = args[ i ];
		}
		else if( typeof args[ i ] === 'boolean' ) {
			result.triggerNow = args[ i ];
		}
	}

	return result;
};

/**
 * Clears all timeouts that are set when the record is created
 *
 * @private
 * @returns {void}
 */
Record.prototype._clearTimeouts = function() {
	clearTimeout( this._readAckTimeout );
	clearTimeout( this._readTimeout );
};

/**
 * Generic handler for ack, read and delete timeouts
 *
 * @private
 * @returns {void}
 */
Record.prototype._onTimeout = function( timeoutType ) {
	this._clearTimeouts();
	this.emit( 'error', timeoutType );
};

module.exports = Record;