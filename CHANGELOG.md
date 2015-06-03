% Queue service changelog  
% Fabrice Le Coz  
% June, 2015

__v1.0.0__

>__Nota :__  The version 0.0.18 is marked as version 1.0.0 ( prod version ).  
> The patched production versions  will be marked as 1.0.x
>
> The development versions will be marked as 1.1.x

__v0.0.18__

  - Fix Schema for received measures
  - Fix Rejected message when no database is found
  
__v0.0.17-1__

  - Fix Timeout on transmitting message to HHRPro instances
  - Fix received message schema for "measures"

__v0.0.17__

  - Fix receive measure from SServer
  
__v0.0.16__

  - add logs for http requests
  - Fix regression on received messages

__v0.0.15-1__

  - Adds some logs on received messages from the SServer
  
__v0.0.15__

  - Fix url to delete msg

__v0.0.14__

  - add a emergency log if the config file couldn't be found
  - add a emergency log if the config file isn't a JSON file
  - change warning to emergency log when checking the config file
  - add "retry" in config file : retry in minutes ( resend messages kept in the queue )
  - set box status to null ( unknown ) on sending init message
  
__v0.0.13__

  - FIX received 'application/json'
  - create a schema for each message type
  
__v0.0.12__

  - add an example of url with basic authentification for SServer
  
__v0.0.11__

  - modif config file : add appSri and retry
  - treatment of error message when getting gateway database
  - Fix agenda to resend the queue every 'retry' minutes
  - mock server read also the appSri parameter from the config file
