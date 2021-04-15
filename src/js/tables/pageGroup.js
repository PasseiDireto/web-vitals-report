function drawTable({
  tableId,
  dimensionName,
  dimensionData,
  e,
  p75,
  score,
  withCount = true,
}) {
  const metricNames = Object.keys(dimensionData[0][1]);
  const segmentNames = Object.keys(dimensionData[0][1][metricNames[0]]);

  const getTotalCount = (values, segment) => {
    return metricNames.reduce((count, metric) => {
      count += values[metric][segment].length;
      return count;
    }, 0);
  };

  document.getElementById(tableId).innerHTML = `
      <thead>
        <tr>
          <th class="Table-dimension">${e(dimensionName)}</th>
          <th class="Table-segment">Segment</th>
          ${metricNames
            .map((metric) => {
              return `<th class="Table-metric">${e(metric)}</th>`;
            })
            .join("")}
          ${withCount && "<th class=\"Table-count\">Count</th>"}
        </tr>
      </thead>
      <tbody>
        ${dimensionData
          .slice(0, 5)
          .map(([dimension, values]) => {
            return segmentNames
              .map(
                (segment, i) => `<tr>
            ${
              i === 0
                ? `<td class="Table-dimension" rowspan="2">${e(dimension)}</td>`
                : ""
            }
            <td class="Table-segment">${e(segment)}</td>
            ${metricNames
              .map((metric) => {
                const result = p75(values[metric][segment]);
                return `
                <td>
                  <div class="Score Score--${score(metric, result)}">
                    ${result}
                  </div>
                </td>
              `;
              })
              .join("")}
            ${withCount && `<td>${getTotalCount(values, segment)}</td>`}
          </tr>`
              )
              .join("");
          })
          .join("")}
      </tbody>
    `;
}

export default { drawTable };
