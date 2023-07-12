import React, { useState, useEffect, useRef, useReducer, useMemo } from 'react';
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
import DonutChart from '../../../static/js/components/PgChart/DonutChart';
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
  table: {
    width: '100%',
    backgroundColor: theme.otherVars.tableBg,
    border: '1px solid rgb(221, 224, 230)',
  },
  tableVal: {
    border: '1px solid rgb(221, 224, 230) !important',
    padding: '10px !important',
  },
  container: {
    height: 'auto',
    background: theme.palette.grey[200],
    padding: '10px',
    marginBottom: '30px',
  },
  containerHeader: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '5px',
  },
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
  'hpc_stats': {'Handle': [], 'Process': []},
};

const SummaryTable = ({ data }) => {
  const classes = useStyles();
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th className={classes.tableVal}>Property</th>
          <th className={classes.tableVal}>Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr className={classes.tableVal} key={index}>
            <td className={classes.tableVal}>{item.name}</td>
            <td className={classes.tableVal}>{item.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Summary({ sid, did, serverConencted, pageVisible, enablePoll=true}) {
  const refreshOn = useRef(null);
  
  const [processHandleCount, processHandleCountReduce] = useReducer(statsReducer, chartsDefault['hpc_stats']);
  const [osStats, setOsStats] = useState([]);
  const [cpuStats, setCpuStats] = useState([]);
  const [processInfoStats, setProcessInfoStats] = useState({'Running': 4, 'Sleeping': 2, 'Stopped': 1, 'Zombie': 2});

  const [counterData, setCounterData] = useState({});

  const [pollDelay, setPollDelay] = useState(5000);
  const [longPollDelay, setLongPollDelay] = useState(180000);
  const [errorMsg, setErrorMsg] = useState(null);

  const tableHeader = [
    {
      Header: 'Property',
      accessor: 'name',
      sortable: true,
      resizable: true,
      disableGlobalFilter: false,
    },
    {
      Header: 'Value',
      accessor: 'value',
      sortable: true,
      resizable: true,
      disableGlobalFilter: false,
    },
  ];

  useEffect(() => {
    try {
      // Fetch the latest data point from the API endpoint
      let url;
      url = url_for('dashboard.system_statistics');
      url += '/' + sid;
      url += did > 0 ? '/' + did : '';
      url += '?chart_names=' + 'pg_sys_os_info,pg_sys_cpu_info';
      const api = getApiInstance();
      api({
        url: url,
        type: 'GET',
      })
        .then((res) => {
          let data = res.data;

          const os_info_obj = data['pg_sys_os_info'];
          let os_info_list = [
            { icon: '', name: 'Name', value: os_info_obj['name'] },
            { icon: '', name: 'Version', value: os_info_obj['version'] },
            { icon: '', name: 'Host name', value: os_info_obj['host_name'] },
            { icon: '', name: 'Domain name', value: os_info_obj['domain_name'] },
            { icon: '', name: 'Architecture', value: os_info_obj['architecture'] },
            { icon: '', name: 'Os up since seconds', value: os_info_obj['os_up_since_seconds'] },
          ];
          setOsStats(os_info_list);

          const cpu_info_obj = data['pg_sys_cpu_info'];
          let cpu_info_list = [
            { icon: '', name: 'Vendor', value: cpu_info_obj['vendor'] },
            { icon: '', name: 'Description', value: cpu_info_obj['description'] },
            { icon: '', name: 'Model name', value: cpu_info_obj['model_name'] },
            { icon: '', name: 'No of cores', value: cpu_info_obj['no_of_cores'] },
            { icon: '', name: 'Architecture', value: cpu_info_obj['architecture'] },
            { icon: '', name: 'Clock speed Hz', value: cpu_info_obj['clock_speed_hz'] },
            { icon: '', name: 'L1 dcache size', value: cpu_info_obj['l1dcache_size'] },
            { icon: '', name: 'L1 icache size', value: cpu_info_obj['l1icache_size'] },
            { icon: '', name: 'L2 cache size', value: cpu_info_obj['l2cache_size'] },
            { icon: '', name: 'L3 cache size', value: cpu_info_obj['l3cache_size'] },
          ];
          setCpuStats(cpu_info_list);

          setErrorMsg(null);
        })
        .catch((error) => {
          console.error('Error fetching data:', error);
        });
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [sid, did, enablePoll, pageVisible]);

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
        refreshOn.current[name] = currEpoch + 5;
      }
    });

    let path = getStatsUrl(sid, did, getFor);
    if (!pageVisible){
      return;
    }
    axios.get(path)
      .then((resp)=>{
        let data = resp.data;
        setErrorMsg(null);
        processHandleCountReduce({incoming: data['hpc_stats']});

        setCounterData((prevCounterData)=>{
          return {
            ...prevCounterData,
            ...data,
          };
        });
      })
      .catch((error)=>{
        if(!errorMsg) {
          processHandleCountReduce({reset:chartsDefault['hpc_stats']});
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

  useInterval(()=>{
    let url;
    url = url_for('dashboard.system_statistics');
    url += '/' + sid;
    url += did > 0 ? '/' + did : '';
    url += '?chart_names=' + 'pi_stats';
    // axios.get(url)
    //   .then((resp)=>{
    //     let data = resp.data;
    //     console.log("pi data: ", data);
    //   })
    //   .catch((error)=>{
    //     if(!errorMsg) {
    //       if(error.response) {
    //         if (error.response.status === 428) {
    //           setErrorMsg(gettext('Please connect to the selected server to view the graph.'));
    //         } else {
    //           setErrorMsg(gettext('An error occurred whilst rendering the graph.'));
    //         }
    //       } else if(error.request) {
    //         setErrorMsg(gettext('Not connected to the server or the connection to the server has been closed.'));
    //         return;
    //       } else {
    //         console.error(error);
    //       }
    //     }
    //   });
    }, enablePoll ? longPollDelay : -1);

  return (
    <>
      <SummaryWrapper
          processHandleCount={transformData(processHandleCount, 5)}
          osStats={osStats}
          cpuStats={cpuStats}
          processInfoStats={transformData(processInfoStats, 5)}
          tableHeader={tableHeader}
          errorMsg={errorMsg}
          showTooltip={true}
          showDataPoints={false}
          lineBorderWidth={1}
          isDatabase={did > 0}
          isTest={false}
        />
    </>
  );
}

Summary.propTypes = {
  sid: PropTypes.oneOfType([PropTypes.string.isRequired, PropTypes.number.isRequired]),
  did: PropTypes.oneOfType([PropTypes.string.isRequired, PropTypes.number.isRequired]),
  serverConnected: PropTypes.bool,
  pageVisible: PropTypes.bool,
  enablePoll: PropTypes.bool,
};

export function SummaryWrapper(props) {
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
          <div className={classes.containerHeader}>{gettext('OS Information')}</div>
          <SummaryTable data={props.osStats} />
        </Grid>
        <Grid item md={6}>
          <div className={classes.containerHeader}>{gettext('Handle & Process Count')}</div>
          <ChartContainer id='hpc-graph' title={gettext('')} datasets={props.processHandleCount.datasets}  errorMsg={props.errorMsg} isTest={props.isTest}>
            <StreamingChart data={props.processHandleCount} dataPointSize={DATA_POINT_SIZE} xRange={X_AXIS_LENGTH} options={options} showSecondAxis={true} />
          </ChartContainer>
        </Grid>
      </Grid>
      <Grid container spacing={1} className={classes.container}>
        <Grid item md={6}>
          <div className={classes.containerHeader}>{gettext('CPU Information')}</div>
          <SummaryTable data={props.cpuStats} />
        </Grid>
        <Grid item md={6}>
          <div className={classes.containerHeader}>{gettext('Process Information')}</div>
          <ChartContainer id='pi-graph' title={gettext('')} datasets={props.processInfoStats.datasets}  errorMsg={props.errorMsg} isTest={props.isTest}>
            <DonutChart data={props.processInfoStats.datasets} />
          </ChartContainer>
        </Grid>
      </Grid>
    </>
  );
}