export function createJourney(maxEvents = 500) {
  const events = [];
  const counters = {
    page_views: 0,
    clicks: 0,
    changes: 0,
    forms_submitted: 0,
    fetches: 0,
    outbound_clicks: 0,
    navigations: 0,
    errors: 0
  };

  function add(record) {
    events.push(record);
    if (events.length > maxEvents) events.shift();
    if (record.event === 'PAGE_VIEW') counters.page_views++;
    if (record.event === 'CLICK') counters.clicks++;
    if (record.event === 'CHANGE') counters.changes++;
    if (record.event === 'FORM_SUBMIT') counters.forms_submitted++;
    if (record.event === 'FETCH' || record.event === 'XHR') counters.fetches++;
    if (record.event === 'OUTBOUND_CLICK') counters.outbound_clicks++;
    if (record.event === 'SPA_NAVIGATION') counters.navigations++;
    if (record.event === 'ERROR' || record.event === 'UNHANDLED_REJECTION') counters.errors++;
  }

  function getEvents() {
    return events.slice();
  }

  function getCounters() {
    return { ...counters, journey_length: events.length };
  }

  return { add, getEvents, getCounters };
}
