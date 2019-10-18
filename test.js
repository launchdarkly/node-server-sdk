var ld = require('./index.js');
var winston = require('winston');

var logger = new winston.Logger({
level: 'debug',
transports: [
  new (winston.transports.Console)(({
    formatter: function(options) {
      return '[LaunchDarkly] ' + (options.message ? options.message : '');
    }
  })),
]
});

var fileSource = ld.FileDataSource({ paths: [ 'test.yml' ], autoUpdate: true, logger: logger });

var config = {
	baseUri: 'https://ld-stg.launchdarkly.com',
	streamUri: 'https://stream-stg.launchdarkly.com',
	eventsUri: 'https://events-stg.launchdarkly.com',
	sendEvents: false,
	//updateProcessor: fileSource,
	logger: logger
};

var client = ld.init('sdk-0acc1044-9cf7-40ea-919f-7b5a8540d9d8', config);

client.on('ready', function() {
	client.variation('catflag', {key: 'user'}, 'bear', function(err, value) {
		console.log('catflag: ' + value);
	});
});
