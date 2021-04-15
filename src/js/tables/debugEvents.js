const NUMBER_OF_LINES = 20;
function drawTable({ tableId, dimensionName, dimensionData, e, p75, score }) {
  console.log(dimensionData);
  const metricNames = Object.keys(dimensionData[0][1]);
  let existingPageGroups = dimensionData.reduce(
    (acc, [eventGroup, metrics]) => {
      const lcp = Object.keys(metrics.LCP);
      const cls = Object.keys(metrics.CLS);
      const fid = Object.keys(metrics.FID);
      return acc.concat(lcp).concat(cls).concat(fid);
    },
    []
  );
  existingPageGroups = [...new Set(existingPageGroups)];

  const pageGroupsInNode = (metrics) => {
    const lcp = Object.keys(metrics.LCP);
    const cls = Object.keys(metrics.CLS);
    const fid = Object.keys(metrics.FID);
    const aux = lcp.concat(cls).concat(fid);
    return [...new Set(aux)];
  };

  const getWorstNodeColum = (node, rowspan) => {
    console.log(node);
    return `<td class="Table-dimension" rowspan="${rowspan}">${e(node)}</td>`;
  };
  const getMetricsColumns = (pageGroup, values) =>
    metricNames
      .map((metric) => {
        const result = p75(values[metric][pageGroup]);
        return `
          <td>
            <div class="Score Score--${score(metric, result)}">
              ${result}
            </div>
          </td>`;
      })
      .join("");

  document.getElementById(tableId).innerHTML = `
      <thead>
        <tr>
          <th class="Table-dimension">${e(dimensionName)}</th>
          <th class="Table-segment">Page Group</th>
          ${metricNames
            .map((metric) => {
              return `<th class="Table-metric">${e(metric)}</th>`;
            })
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${dimensionData
          .slice(0, NUMBER_OF_LINES)
          .map(([node, values]) => {
            const pageGroups = pageGroupsInNode(values);
            return existingPageGroups
              .map((pageGroup, i) => {
                if (pageGroups.indexOf(pageGroup) >= 0)
                  return `<tr>
                    ${getWorstNodeColum(node, pageGroups.length)}
                    <td class="Table-pageGroup">${e(pageGroup)}</td>
                    ${getMetricsColumns(pageGroup, values)}
                  </tr>`;
              })
              .join("");
          })
          .join("")}
      </tbody>
    `;
}

export default { drawTable };
