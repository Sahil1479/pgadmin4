import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useResizeDetector } from 'react-resize-detector';

const DonutChart = ({ data }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (data && Object.keys(data).length > 0) {
        if (chartInstance.current) {
            // If chart instance exists, update the data
            chartInstance.current.data.labels = data.map((item) => item.label);
            chartInstance.current.data.datasets[0].data = data.map((item) => item.data);
            chartInstance.current.update();
        } else {
            // If chart instance doesn't exist, create a new chart
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                    display: false, // Hide the labels at the top
                    },
                },
                animation: {
                    duration: 0, // Disable the animation
                },
                tooltips: {
                    callbacks: {
                    label: function (tooltipItem, chartData) {
                        const dataset = chartData.datasets[tooltipItem.datasetIndex];
                        const total = dataset.data.reduce((previousValue, currentValue) => previousValue + currentValue);
                        const currentValue = dataset.data[tooltipItem.index];
                        const percentage = ((currentValue / total) * 100).toFixed(2) + '%';
                        return dataset.label + ': ' + currentValue + ' (' + percentage + ')';
                    },
                    },
                },
            };

            const chartData = {
            labels: data.map((item) => item.label),
            datasets: [
                {
                data: data.map((item) => item.data),
                backgroundColor: data.map((item) => item.borderColor),
                hoverBackgroundColor: data.map((item) => item.borderColor),
                },
            ],
            };

            const ctx = chartRef.current.getContext('2d');
            chartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: chartOptions,
            });
        }
        }
    }, [data]);

    return (
        <canvas ref={chartRef} />
    );
};

export default DonutChart;
