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
  'cu_stats': {'User Normal': [], 'User Niced': [], 'Kernel': [], 'Idle': []},
  'la_stats': {'1 min': [], '5 mins': [], '10 mins': [], '15 mins': []},
  'pcu_stats': {},
};

export default function CPU({ sid, did, serverConencted, pageVisible, enablePoll=true}) {
  const refreshOn = useRef(null);
  
  const [cpuUsageInfo, cpuUsageInfoReduce] = useReducer(statsReducer, chartsDefault['cu_stats']);
  const [loadAvgInfo, loadAvgInfoReduce] = useReducer(statsReducer, chartsDefault['la_stats']);
  const [processCpuUsageStats, setProcessCpuUsageStats] = useState([]);

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
        Header: 'CPU Usage',
        accessor: 'cpu_usage',
        sortable: true,
        resizable: true,
        disableGlobalFilter: false,
    },
  ];
  const [errorMsg, setErrorMsg] = useState(null);
  const [chartDrawnOnce, setChartDrawnOnce] = useState(false);

  const [refreshPreferences, setRefreshPreferences] = useState({'cu_stats': 5, 'la_stats': 60, 'pcu_stats': 10});

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
        if(data.hasOwnProperty('cu_stats')){
          let new_cu_stats = {
            'User Normal': data['cu_stats']['usermode_normal_process_percent']?data['cu_stats']['usermode_normal_process_percent']:0, 
            'User Niced': data['cu_stats']['usermode_niced_process_percent']?data['cu_stats']['usermode_niced_process_percent']:0, 
            'Kernel': data['cu_stats']['kernelmode_process_percent']?data['cu_stats']['kernelmode_process_percent']:0, 
            'Idle': data['cu_stats']['idle_mode_percent']?data['cu_stats']['idle_mode_percent']:0,
          };
          cpuUsageInfoReduce({incoming: new_cu_stats});
        }
        
        if(data.hasOwnProperty('la_stats')){
          let new_la_stats = {
            '1 min': data['la_stats']['load_avg_one_minute']?data['la_stats']['load_avg_one_minute']:0, 
            '5 mins': data['la_stats']['load_avg_five_minutes']?data['la_stats']['load_avg_five_minutes']:0, 
            '10 mins': data['la_stats']['load_avg_ten_minutes']?data['la_stats']['load_avg_ten_minutes']:0, 
            '15 mins': data['la_stats']['load_avg_fifteen_minutes']?data['la_stats']['load_avg_fifteen_minutes']:0,
          };
          loadAvgInfoReduce({incoming: new_la_stats});
        }
        
        if(data.hasOwnProperty('pcu_stats')){
          let pcu_info_list = [];
          const pcu_info_obj = data['pcu_stats'];
          for (const key in pcu_info_obj) {
            pcu_info_list.push({ icon: '', pid: pcu_info_obj[key]['pid'], name: pcu_info_obj[key]['name'], cpu_usage: pcu_info_obj[key]['cpu_usage'] });
          }
          
          setProcessCpuUsageStats(pcu_info_list);
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
          cpuUsageInfoReduce({reset:chartsDefault['cu_stats']});
          loadAvgInfoReduce({reset:chartsDefault['la_stats']});
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
        <CPUWrapper
          cpuUsageInfo={transformData(cpuUsageInfo, refreshPreferences['cu_stats'])}
          loadAvgInfo={transformData(loadAvgInfo, refreshPreferences['la_stats'])}
          processCpuUsageStats={processCpuUsageStats}
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

CPU.propTypes = {
  sid: PropTypes.oneOfType([PropTypes.string.isRequired, PropTypes.number.isRequired]),
  did: PropTypes.oneOfType([PropTypes.string.isRequired, PropTypes.number.isRequired]),
  serverConnected: PropTypes.bool,
  pageVisible: PropTypes.bool,
  enablePoll: PropTypes.bool,
};

export function CPUWrapper(props) {
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
          <div className={classes.containerHeader}>{gettext('CPU Usage')}</div>
          <ChartContainer id='cu-graph' title={gettext('')} datasets={props.cpuUsageInfo.datasets}  errorMsg={props.errorMsg} isTest={props.isTest}>
            <StreamingChart data={props.cpuUsageInfo} dataPointSize={DATA_POINT_SIZE} xRange={X_AXIS_LENGTH} options={options} />
          </ChartContainer>
        </Grid>
        <Grid item md={6}>
          <div className={classes.containerHeader}>{gettext('Load Average')}</div>
          <ChartContainer id='la-graph' title={gettext('')} datasets={props.loadAvgInfo.datasets}  errorMsg={props.errorMsg} isTest={props.isTest}>
            <StreamingChart data={props.loadAvgInfo} dataPointSize={DATA_POINT_SIZE} xRange={X_AXIS_LENGTH} options={options} />
          </ChartContainer>
        </Grid>
      </Grid>
      <Grid container spacing={1} className={classes.fixedContainer}>
        <PgTable
          className={classes.autoResizer}
          columns={props.tableHeader}
          data={props.processCpuUsageStats}
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
CPUWrapper.propTypes = {
  cpuUsageInfo: propTypeStats.isRequired,
  loadAvgInfo: propTypeStats.isRequired,
  processCpuUsageStats: PropTypes.array.isRequired,
  tableHeader: PropTypes.array.isRequired,
  errorMsg: PropTypes.string,
  showTooltip: PropTypes.bool.isRequired,
  showDataPoints: PropTypes.bool.isRequired,
  lineBorderWidth: PropTypes.number.isRequired,
  isDatabase: PropTypes.bool.isRequired,
  isTest: PropTypes.bool,
};