% Queue service changelog  
% Fabrice Le Coz  
% February, 2015

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
