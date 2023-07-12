import React, { useState, useEffect, useRef, useReducer, useMemo } from 'react';
import PgTable from 'sources/components/PgTable';
import gettext from 'sources/gettext';
import PropTypes from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import url_for from 'sources/url_for';
import getApiInstance from 'sources/api_instance';
import {getEpoch} from 'sources/utils';
import {ChartContainer} from './Dashboard';
import { Grid } from '@material-ui/core';
import { DATA_POINT_SIZE } from 'sources/chartjs';
import StreamingChart from '../../../static/js/components/PgChart/StreamingChart';
import {useInterval} from 'sources/custom_hooks';
import axios from 'axios';

export const X_AXIS_LENGTH = 75;

const useStyles = makeStyles((theme) => ({
  autoResizer: {
    height: '100% !important',
    width: '100% !important',
    background: theme.palette.grey[400],
    padding: '7.5px',
    overflowX: 'auto !important',
    overflowY: 'hidden !important',
    minHeight: '100%',
    minWidth: '100%',
  },
  container: {
    height: 'auto',
    background: theme.palette.grey[200],
    padding: '10px',
    marginBottom: '30px',
  },
  fixedContainer: {
    height: '577px',
    background: theme.palette.grey[200],
    padding: '10px',
    marginBottom: '30px',
  },
  containerHeader: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '5px',
  }
}));

export function transformData(labels, refreshRate) {
  const colors = ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#8D6E63','#2196F3','#FFEB3B','#9C27B0','#00BCD4','#CDDC39'];
  let datasets = Object.keys(labels).map((label, i)=>{
    return {
      label: label,
      data: labels[label] || [],
      borderColor: colors[i],
      pointHitRadius: DATA_POINT_SIZE,
    };
  }) || [];

  return {
    datasets: datasets,
    refreshRate: refreshRate,
  };
}

/* URL for fetching graphs data */
export function getStatsUrl(sid=-1, did=-1, chart_names=[]) {
  let base_url = url_for('dashboard.system_statistics');
  base_url += '/' + sid;
  base_url += (did > 0) ? ('/' + did) : '';
  base_url += '?chart_names=' + chart_names.join(',');
  
  return base_url;
}

/* This will process incoming charts data add it the previous charts
 * data to get the new state.
 */
export function statsReducer(state, action) {

  if(action.reset) {
    return action.reset;
  }

  if(!action.incoming) {
    return state;
  }

  if(!action.counterData) {
    action.counterData = action.incoming;
  }

  let newState = {};
  Object.keys(action.incoming).forEach(label => {
    if(state[label]) {
      newState[label] = [
        action.counter ?  action.incoming[label] - action.counterData[label] : action.incoming[label],
        ...state[label].slice(0, X_AXIS_LENGTH-1),
      ];
    } else {
      newState[label] = [
        action.counter ?  action.incoming[label] - action.counterData[label] : action.incoming[label],
      ];
    }
  });
  return newState;
}

const chartsDefault = {
  'm_stats': {'Total': [], 'Used': [], 'Free': []},
  'sm_stats': {'Total': [], 'Used': [], 'Free': []},
  'pmu_stats': {},
};

export default function Memory({ sid, did, serverConencted, pageVisible, enablePoll=true}) {
  const refreshOn = useRef(null);
  
  const [memoryUsageInfo, memoryUsageInfoReduce] = useReducer(statsReducer, chartsDefault['m_stats']);
  const [swapMemoryUsageInfo, swapMemoryUsageInfoReduce] = useReducer(statsReducer, chartsDefault['sm_stats']);
  const [processMemoryUsageStats, setProcessMemoryUsageStats] = useState([]);

  const [counterData, setCounterData] = useState({});

  const [pollDelay, setPollDelay] = useState(5000);
  const tableHeader = [
    {
        Header: 'PID',
        accessor: 'pid',
        sortable: true,
        resizable: true,
        disableGlobalFilter: false,
    },
    {
        Header: 'Name',
        accessor: 'name',
        sortable: true,
        resizable: true,
        disableGlobalFilter: false,
    },
    {
        Header: 'Memory Usage',
        accessor: 'memory_usage',
        sortable: true,
        resizable: true,
        disableGlobalFilter: false,
    },
    {
      Header: 'Memory Bytes',
      accessor: 'memory_bytes',
      sortable: true,
      resizable: true,
      disableGlobalFilter: false,
    },
  ];
  const [errorMsg, setErrorMsg] = useState(null);
  const [chartDrawnOnce, setChartDrawnOnce] = useState(false);

  const [refreshPreferences, setRefreshPreferences] = useState({'m_stats': 5, 'sm_stats': 5, 'pmu_stats': 5});

  useEffect(()=>{
    /* Charts rendered are not visible when, the dashboard is hidden but later visible */
    if(pageVisible && !chartDrawnOnce) {
      setChartDrawnOnce(true);
    }
  }, [pageVisible]);

  useInterval(()=>{
    const currEpoch = getEpoch();
    if(refreshOn.current === null) {
      let tmpRef = {};
      Object.keys(chartsDefault).forEach((name)=>{
        tmpRef[name] = currEpoch;
      });
      refreshOn.current = tmpRef;
    }

    let getFor = [];
    Object.keys(chartsDefault).forEach((name)=>{
      if(currEpoch >= refreshOn.current[name]) {
        getFor.push(name);
        refreshOn.current[name] = currEpoch + refreshPreferences[name];
      }
    });

    let path = getStatsUrl(sid, did, getFor);
    if (!pageVisible){
      return;
    }
    axios.get(path)
      .then((resp)=>{
        let data = resp.data;
        console.log(data);
        setErrorMsg(null);
        if(data.hasOwnProperty('m_stats')){
          let new_m_stats = {
            'Total': data['m_stats']['total_memory']?data['m_stats']['total_memory']:0, 
            'Used': data['m_stats']['used_memory']?data['m_stats']['used_memory']:0, 
            'Free': data['m_stats']['free_memory']?data['m_stats']['free_memory']:0, 
          };
          memoryUsageInfoReduce({incoming: new_m_stats});
        }
        
        if(data.hasOwnProperty('sm_stats')){
          let new_sm_stats = {
            'Total': data['sm_stats']['swap_total']?data['sm_stats']['swap_total']:0, 
            'Used': data['sm_stats']['swap_used']?data['sm_stats']['swap_used']:0, 
            'Free': data['sm_stats']['swap_free']?data['sm_stats']['swap_free']:0, 
          };
          swapMemoryUsageInfoReduce({incoming: new_sm_stats});
        }
        
        if(data.hasOwnProperty('pmu_stats')){
          let pmu_info_list = [];
          const pmu_info_obj = data['pmu_stats'];
          for (const key in pmu_info_obj) {
            pmu_info_list.push({ icon: '', pid: pmu_info_obj[key]['pid'], name: pmu_info_obj[key]['name'], memory_usage: pmu_info_obj[key]['memory_usage'], memory_bytes: pmu_info_obj[key]['memory_bytes'] });
          }
          
          setProcessMemoryUsageStats(pmu_info_list);
        }

        setCounterData((prevCounterData)=>{
          return {
            ...prevCounterData,
            ...data,
          };
        });
      })
      .catch((error)=>{
        if(!errorMsg) {
          memoryUsageInfoReduce({reset:chartsDefault['m_stats']});
          swapMemoryUsageInfoReduce({reset:chartsDefault['sm_stats']});
          setCounterData({});
          if(error.response) {
            if (error.response.status === 428) {
              setErrorMsg(gettext('Please connect to the selected server to view the graph.'));
            } else {
              setErrorMsg(gettext('An error occurred whilst rendering the graph.'));
            }
          } else if(error.request) {
            setErrorMsg(gettext('Not connected to the server or the connection to the server has been closed.'));
            return;
          } else {
            console.error(error);
          }
        }
      });
  }, enablePoll ? pollDelay : -1);

  return (
    <>
      <div data-testid='graph-poll-delay' style={{display: 'none'}}>{pollDelay}</div>
      {chartDrawnOnce &&
        <MemoryWrapper
          memoryUsageInfo={transformData(memoryUsageInfo, refreshPreferences['m_stats'])}
          swapMemoryUsageInfo={transformData(swapMemoryUsageInfo, refreshPreferences['sm_stats'])}
          processMemoryUsageStats={processMemoryUsageStats}
          tableHeader={tableHeader}
          errorMsg={errorMsg}
          showTooltip={true}
          showDataPoints={false}
          lineBorderWidth={1}
          isDatabase={did > 0}
          isTest={false}
        />
      }
    </>
  );
}

Memory.propTypes = {
  sid: PropTypes.oneOfType([PropTypes.string.isRequired, PropTypes.number.isRequired]),
  did: PropTypes.oneOfType([PropTypes.string.isRequired, PropTypes.number.isRequired]),
  serverConnected: PropTypes.bool,
  pageVisible: PropTypes.bool,
  enablePoll: PropTypes.bool,
};

export function MemoryWrapper(props) {
  const classes = useStyles();
  const options = useMemo(()=>({
    showDataPoints: props.showDataPoints,
    showTooltip: props.showTooltip,
    lineBorderWidth: props.lineBorderWidth,
  }), [props.showTooltip, props.showDataPoints, props.lineBorderWidth]);
  return (
    <>
      <Grid container spacing={1} className={classes.container}>
        <Grid item md={6}>
          <div className={classes.containerHeader}>{gettext('Memory')}</div>
          <ChartContainer id='m-graph' title={gettext('')} datasets={props.memoryUsageInfo.datasets}  errorMsg={props.errorMsg} isTest={props.isTest}>
            <StreamingChart data={props.memoryUsageInfo} dataPointSize={DATA_POINT_SIZE} xRange={X_AXIS_LENGTH} options={options} />
          </ChartContainer>
        </Grid>
        <Grid item md={6}>
          <div className={classes.containerHeader}>{gettext('Swap Memory')}</div>
          <ChartContainer id='sm-graph' title={gettext('')} datasets={props.swapMemoryUsageInfo.datasets}  errorMsg={props.errorMsg} isTest={props.isTest}>
            <StreamingChart data={props.swapMemoryUsageInfo} dataPointSize={DATA_POINT_SIZE} xRange={X_AXIS_LENGTH} options={options} />
          </ChartContainer>
        </Grid>
      </Grid>
      <Grid container spacing={1} className={classes.fixedContainer}>
        <PgTable
          className={classes.autoResizer}
          columns={props.tableHeader}
          data={props.processMemoryUsageStats}
          msg={props.errorMsg}
          type={'panel'}
        ></PgTable>
      </Grid>
    </>
  );
}

const propTypeStats = PropTypes.shape({
  datasets: PropTypes.array,
  refreshRate: PropTypes.number.isRequired,
});
MemoryWrapper.propTypes = {
  memoryUsageInfo: propTypeStats.isRequired,
  swapMemoryUsageInfo: propTypeStats.isRequired,
  processMemoryUsageStats: PropTypes.array.isRequired,
  tableHeader: PropTypes.array.isRequired,
  errorMsg: PropTypes.string,
  showTooltip: PropTypes.bool.isRequired,
  showDataPoints: PropTypes.bool.isRequired,
  lineBorderWidth: PropTypes.number.isRequired,
  isDatabase: PropTypes.bool.isRequired,
  isTest: PropTypes.bool,
};