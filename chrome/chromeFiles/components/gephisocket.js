function LOG(msg) {
  var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
  consoleService.logStringMessage(msg);
}

/***********************************************************
constants
***********************************************************/

// reference to the interface defined in nsIHelloWorld.idl
const nsIGephiSocket = Components.interfaces.nsIGephiSocket;

// reference to the required base interface that all components must support
const nsISupports = Components.interfaces.nsISupports;

// UUID uniquely identifying our component
// You can get from: http://kruithof.xs4all.nl/uuid/uuidgen here
const CLASS_ID = Components.ID("{9a12b8a0-8f40-11dd-ad8b-0800200c9a66}");

// description
const CLASS_NAME = "Gephi Socket";

// textual unique identifier
const CONTRACT_ID = "@gephi.org/socket;1";

/***********************************************************
class definition
***********************************************************/

//class constructor
function GephiSocket() {
// If you only need to access your component from Javascript, uncomment the following line:
this.wrappedJSObject = this;
};

// class definition
GephiSocket.prototype = 
{  
	debug : true,
	
	createConnection: function(host, port) 
	{	
		//if(this.connection==null || !this.connection.isAlive())
		//{	
			var transportService = Components.classes["@mozilla.org/network/socket-transport-service;1"].getService(Components.interfaces.nsISocketTransportService);
			var transport = transportService.createTransport(null,0,host,port,null);
			this.connection = transport;
			
			//if(!this.connection.isAlive())
				//throw "Impossible to connect to "+host+" on the port "+port;
		//}
	},
	
	pushData: function(data)
	{
		//if(!this.connection.isAlive())
			//throw "The connection is dead";
		
		if(this.debug)
		{
			this.bytesUploaded = 0;
			this.connection.setEventSink(this, null);
		}
		
		//var outstream = this.connection.openOutputStream(0,0,0);
		var outstream = this.connection.openOutputStream(Components.interfaces.nsITransport.OPEN_BLOCKING,0,32); 
		outstream.write(data,data.length);
		outstream.close();
	},
	
	setDebug: function(debug)
	{
		this.debug=debug;
	},
	
	bytesUploaded : 0,
	onTransportStatus: function(transport, status, progress, progressMax) {
		this.bytesUploaded += progress;
		
		var progressStr="";
		if(progressMax!=-1)
			progressStr+=" on "+progressMax;
		
		switch(status) {
			case Components.interfaces.nsISocketTransport.STATUS_CONNECTED_TO:
				LOG("Gephisocket: connected");
	        break;
			case Components.interfaces.nsISocketTransport.STATUS_SENDING_TO:
				LOG("Gephisocket: sending "+progress+progressStr+" bytes. Already "+this.bytesUploaded+" has been sent.");
			break;
		}
    },

  QueryInterface: function(aIID)
  {
    if (!aIID.equals(nsIGephiSocket) &&    
        !aIID.equals(nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  }
};

/***********************************************************
class factory

This object is a member of the global-scope Components.classes.
It is keyed off of the contract ID. Eg:

gephiSocket = Components.classes["@gephi.org/socket;1"].
                          createInstance(Components.interfaces.nsIGephiSocket);

***********************************************************/
var GephiSocketFactory = {
  createInstance: function (aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    return (new GephiSocket()).QueryInterface(aIID);
  }
};

/***********************************************************
module definition (xpcom registration)
***********************************************************/
var GephiSocketModule = {
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType)
  {
    aCompMgr = aCompMgr.
        QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, 
        CONTRACT_ID, aFileSpec, aLocation, aType);
  },

  unregisterSelf: function(aCompMgr, aLocation, aType)
  {
    aCompMgr = aCompMgr.
        QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
  },
  
  getClassObject: function(aCompMgr, aCID, aIID)
  {
    if (!aIID.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    if (aCID.equals(CLASS_ID))
      return GephiSocketFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

/***********************************************************
module initialization

When the application registers the component, this function
is called.
***********************************************************/
function NSGetModule(aCompMgr, aFileSpec) { return GephiSocketModule; }
