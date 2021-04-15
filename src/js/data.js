/*
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getReport, getSegmentNameById } from "./api.js";
import { WebVitalsError } from "./WebVitalsError.js";

export function getDefaultOpts() {
  return {
    active: false,
    metricNameDim: "ga:eventAction",
    metricIdDim: "ga:eventLabel",
    lcpName: "LCP",
    fidName: "FID",
    clsName: "CLS",
    filters: "",
  };
}

function getViewOpts(state) {
  const stateOpts = state[`opts:${state.viewId}`];
  return stateOpts && stateOpts.active ? stateOpts : getDefaultOpts();
}

export async function getWebVitalsData(state) {
  const reportRequest = buildReportRequest(state);
  const { rows, meta } = await getReport(reportRequest);

  const opts = getViewOpts(state);
  const metricNameMap = {
    [opts.lcpName]: "LCP",
    [opts.fidName]: "FID",
    [opts.clsName]: "CLS",
  };

  if (rows.length === 0) {
    throw new WebVitalsError("no_web_vitals_events");
  }

  const getSegmentsObj = (getDefaultValue = () => []) => {
    const segmentIdA = reportRequest.segments[0].segmentId.slice(6);
    const segmentIdB = reportRequest.segments[1].segmentId.slice(6);
    return {
      [getSegmentNameById(segmentIdA)]: getDefaultValue(),
      [getSegmentNameById(segmentIdB)]: getDefaultValue(),
    };
  };

  const getMetricsObj = (getDefaultValue = getSegmentsObj) => {
    return {
      LCP: getDefaultValue(),
      FID: getDefaultValue(),
      CLS: getDefaultValue(),
    };
  };

  const incrementCount = (obj) => {
    if (!Object.prototype.hasOwnProperty.call(obj, "count")) {
      Object.defineProperty(obj, "count", { writable: true, value: 0 });
    }
    obj.count++;
  };

  const data = {
    metrics: getMetricsObj(() => {
      return { values: [], segments: getSegmentsObj(), dates: {} };
    }),
    pages: [],
    pageGroup: [],
    debugEvents: [],
  };

  for (const row of rows) {
    let value = Number(row.metrics[0].values[0]);
    let [segmentId, date, metric, pageGroup, debugEvent] = row.dimensions;
    const segment = getSegmentNameById(segmentId);

    // Convert the metric from any custom name to the standard name.
    metric = metricNameMap[metric];

    // CLS is sent to Google Analytics at 1000x for greater precision.
    if (metric === "CLS") {
      value = value / 1000;
    }

    // Even though the report limits `metric` values to LCP, FID, and CLS,
    // for reports with more than a million rows of data, Google Analytics
    // will aggregate everything after the first million rows into and "(other)"
    // bucket, which skews the data and makes the report useless.
    // The only solution to this is to make more granular requests (e.g.
    // reduce the date range or add filters) and manually combine the data
    // yourself.
    if (metric !== "LCP" && metric !== "FID" && metric !== "CLS") {
      throw new WebVitalsError("unexpected_metric", metric);
    }

    const metricData = data.metrics[metric];
    metricData.values.push(value);

    // Breakdown by segment.
    metricData.segments[segment] = metricData.segments[segment] || [];
    metricData.segments[segment].push(value);

    // Breakdown by date.
    metricData.dates[date] = metricData.dates[date] || getSegmentsObj();
    metricData.dates[date][segment].push(value);

    // Breakdown by page.
    data.pages[pageGroup] = data.pages[pageGroup] || getMetricsObj();
    data.pages[pageGroup][metric][segment].push(value);
    incrementCount(data.pages[pageGroup]);

    // Breakdown by pagegroup
    data.pageGroup[pageGroup] = data.pageGroup[pageGroup] || getMetricsObj();
    data.pageGroup[pageGroup][metric][segment].push(value);
    incrementCount(data.pageGroup[pageGroup]);

    // Breakdown by debugEvent
    data.debugEvents[debugEvent] =
      data.debugEvents[debugEvent] || getMetricsObj(() => ({}));
    if (!data.debugEvents[debugEvent][metric][pageGroup])
      data.debugEvents[debugEvent][metric][pageGroup] = [];
    data.debugEvents[debugEvent][metric][pageGroup].push(value);
    incrementCount(data.debugEvents[debugEvent]);
  }
  // console.log(data.debugEvents);

  // Sort data
  function sortObjByCount(obj) {
    const newObj = {};
    const sortedKeys = Object.keys(obj).sort(
      (a, b) => obj[b].count - obj[a].count
    );

    for (const key of sortedKeys) {
      newObj[key] = obj[key];
    }
    return newObj;
  }

  // Sort data by count.
  data.pages = sortObjByCount(data.pages);
  data.pageGroup = sortObjByCount(data.pageGroup);
  data.debugEvents = sortObjByCount(data.debugEvents);

  return { data, rows, meta };
}

function parseFilters(filtersExpression) {
  if (filtersExpression.match(/[^\\],/)) {
    throw new WebVitalsError("unsupported_filter_expression");
  }

  // TODO: add support for escaping semicolons.
  return filtersExpression.split(";").map((expression) => {
    const match = /(ga:\w+)([!=][=@~])(.+)$/.exec(expression);
    if (!match) {
      throw new WebVitalsError("invalid_filter_expression", expression);
    }

    const filter = {
      dimensionName: match[1],
      expressions: [match[3]],
    };

    if (match[2].startsWith("!")) {
      filter.not = true;
    }

    if (match[2].endsWith("=")) {
      filter.operator = "EXACT";
    } else if (match[2].endsWith("@")) {
      filter.operator = "PARTIAL";
    } else if (match[3].endsWith("~")) {
      filter.operator = "REGEXP";
    }
    return filter;
  });
}

function buildReportRequest(state) {
  const { viewId, startDate, endDate, segmentA, segmentB } = state;
  const opts = getViewOpts(state);

  let filters = [
    {
      dimensionName: opts.metricNameDim,
      operator: "IN_LIST",
      expressions: [opts.lcpName, opts.fidName, opts.clsName],
    },
  ];

  if (opts.filters) {
    filters = filters.concat(parseFilters(opts.filters));
  }

  return {
    viewId,
    pageSize: 100000,
    includeEmptyRows: true,
    dateRanges: [{ startDate, endDate }],
    segments: [
      { segmentId: `gaid::${segmentA}` },
      { segmentId: `gaid::${segmentB}` },
    ],
    metrics: [{ expression: "ga:eventValue" }],
    dimensions: [
      { name: "ga:segment" },
      { name: "ga:date" },
      { name: opts.metricNameDim }, // Metric name (ga:eventAction)
      { name: "ga:contentGroup1" },
      { name: "ga:dimension2" }, //causador de cls
      { name: opts.metricIdDim }, // Unique metric ID (ga:eventLabel)
    ],
    dimensionFilterClauses: {
      operator: "AND",
      filters,
    },
    orderBys: [
      {
        fieldName: "ga:eventValue",
        sortOrder: "ASCENDING",
      },
      {
        fieldName: "ga:date",
        sortOrder: "ASCENDING",
      },
    ],
  };
}
