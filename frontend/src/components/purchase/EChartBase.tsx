import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface EChartBaseProps {
  option: EChartsOption;
  height?: number | string;
}

/** Canvas-size follows its card (normal web behaviour), but every option
 *  passed in must already carry fixed colors/order/label positions —
 *  no chart here is allowed to invent its own layout at render time. */
export default function EChartBase({ option, height = '100%' }: EChartBaseProps) {
  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  );
}
