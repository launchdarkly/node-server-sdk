var EventSummarizer = require('../event_summarizer');

describe('EventSummarizer', function() {

  var user = { key: 'key1' };

  it('does nothing for identify event', function() {
    var es = EventSummarizer();
    var snapshot = es.get_summary();
    es.summarize_event({ kind: 'identify', creationDate: 1000, user: user });
    expect(es.get_summary()).toEqual(snapshot);
  });

  it('does nothing for custom event', function() {
    var es = EventSummarizer();
    var snapshot = es.get_summary();
    es.summarize_event({ kind: 'custom', creationDate: 1000, key: 'eventkey', user: user });
    expect(es.get_summary()).toEqual(snapshot);
  });

  it('sets start and end dates for feature events', function() {
    var es = EventSummarizer();
    var event1 = { kind: 'feature', creationDate: 2000, key: 'key', user: user };
    var event2 = { kind: 'feature', creationDate: 1000, key: 'key', user: user };
    var event3 = { kind: 'feature', creationDate: 1500, key: 'key', user: user };
    es.summarize_event(event1);
    es.summarize_event(event2);
    es.summarize_event(event3);
    var data = es.get_summary();

    expect(data.startDate).toEqual(1000);
    expect(data.endDate).toEqual(2000);
  });

  it('increments counters for feature events', function() {
    var es = EventSummarizer();
    var event1 = { kind: 'feature', creationDate: 1000, key: 'key1', version: 11, user: user,
      variation: 1, value: 100, default: 111 };
    var event2 = { kind: 'feature', creationDate: 1000, key: 'key1', version: 11, user: user,
      variation: 2, value: 200, default: 111 };
    var event3 = { kind: 'feature', creationDate: 1000, key: 'key2', version: 22, user: user,
      variation: 1, value: 999, default: 222 };
    var event4 = { kind: 'feature', creationDate: 1000, key: 'key1', version: 11, user: user,
      variation: 1, value: 100, default: 111 };
    var event5 = { kind: 'feature', creationDate: 1000, key: 'badkey', user: user,
      value: 333, default: 333 };
    es.summarize_event(event1);
    es.summarize_event(event2);
    es.summarize_event(event3);
    es.summarize_event(event4);
    es.summarize_event(event5);
    var data = es.get_summary();

    data.features.key1.counters.sort(function(a, b) { return a.value - b.value; });
    var expectedFeatures = {
      key1: {
        default: 111,
        counters: [
          { value: 100, version: 11, count: 2 },
          { value: 200, version: 11, count: 1 }
        ]
      },
      key2: {
        default: 222,
        counters: [ { value: 999, version: 22, count: 1 }]
      },
      badkey: {
        default: 333,
        counters: [ { value: 333, unknown: true, count: 1 }]
      }
    };
    expect(data.features).toEqual(expectedFeatures);
  });
});
