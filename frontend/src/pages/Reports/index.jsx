/**
 * pages/Reports/index.jsx — PREMIUM UI + WORKING EXPORT
 */

import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Table, Spin, Alert, Statistic,
  Typography, Grid, Space, DatePicker, Button, Divider, message,
} from 'antd';
import {
  DollarCircleOutlined, RiseOutlined, FallOutlined,
  LineChartOutlined, ExclamationCircleOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { request } from '@/request';
import useFetch from '@/hooks/useFetch';
import useLanguage from '@/locale/useLanguage';
import { useMoney } from '@/settings';
import { DashboardLayout } from '@/layout';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

export default function Reports() {
  const translate          = useLanguage();
  const { moneyFormatter } = useMoney();
  const screens            = useBreakpoint();
  const isMobile           = !screens.md;

  const [range, setRange]   = useState([]);
  const [loading, setLoading] = useState(true);

  const { result: dashboardData, error } = useFetch(() =>
    request.get({ entity: 'reports' })
  );

  useEffect(() => {
    if (dashboardData || error) setLoading(false);
  }, [dashboardData, error]);

  const data = dashboardData || {};

  if (loading)
    return (
      <DashboardLayout>
        <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
      </DashboardLayout>
    );

  if (error)
    return (
      <DashboardLayout>
        <Alert message="Error loading reports" type="error" showIcon style={{ margin: 24 }} />
      </DashboardLayout>
    );

  // ── Defaulted amount ──────────────────────────────────────────────────────
  const defaultedAmount = (data.statusBreakdown || [])
    .filter(s => String(s.status).toLowerCase() === 'default')
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = [
    { title: 'Total Collected',  value: data.collections?.totalCollected  ?? 0, icon: <DollarCircleOutlined />, color: '#16a34a', bg: '#f0fdf4' },
    { title: 'Pending Balance',  value: data.collections?.totalPending    ?? 0, icon: <FallOutlined />,          color: '#dc2626', bg: '#fef2f2' },
    { title: 'Month Collected',  value: data.collections?.monthCollected  ?? 0, icon: <RiseOutlined />,          color: '#2563eb', bg: '#eff6ff' },
    { title: 'Month Pending',    value: data.collections?.monthPending    ?? 0, icon: <LineChartOutlined />,     color: '#d97706', bg: '#fffbeb' },
    { title: 'Defaulted Amount', value: defaultedAmount,                         icon: <ExclamationCircleOutlined />, color: '#b91c1c', bg: '#fef2f2' },
  ];

  // ── Table columns ─────────────────────────────────────────────────────────
  const statusColumns = [
    {
      title: 'Status', dataIndex: 'status',
      render: (v) => {
        const w = String(v || '').replace(/_/g, ' ').toLowerCase()
          .split(' ').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
        const colors = { Paid: '#52c41a', Late: '#fa8c16', Partial: '#faad14', Default: '#ff4d4f', 'Not Started': '#8c8c8c' };
        return <span style={{ color: colors[w] || '#595959', fontWeight: 500 }}>{w}</span>;
      },
    },
    { title: 'Count',      dataIndex: 'count',      align: 'right' },
    { title: 'Percentage', dataIndex: 'percentage', align: 'right', render: v => `${v}%` },
  ];

  const planColumns = [
    { title: 'Plan Group', dataIndex: 'planGroup',          render: v => v || 'Unknown' },
    { title: 'Customers',  dataIndex: 'customers', align: 'right' },
    { title: 'Collected',  dataIndex: 'collected',     align: 'right', render: v => <span style={{ color: '#16a34a' }}>{moneyFormatter({ amount: v ?? 0 })}</span> },
    { title: 'Pending',    dataIndex: 'pending',       align: 'right', render: v => <span style={{ color: '#dc2626' }}>{moneyFormatter({ amount: v ?? 0 })}</span> },
  ];

  // ── CSV Export (client-side — no API call, no auth needed) ───────────────
  const handleExportCSV = () => {
  try {
    const from = range?.[0];
    const to   = range?.[1];

    // Filter status breakdown (if date available)
    const filteredStatus = (data.statusBreakdown || []).filter(r => {
      if (!from || !to) return true;
      if (!r.date) return true; // fallback if backend doesn't send date
      const d = new Date(r.date);
      return d >= from.toDate() && d <= to.toDate();
    });

    const filteredPlan = (data.planWise || []).filter(r => {
      if (!from || !to) return true;
      if (!r.date) return true;
      const d = new Date(r.date);
      return d >= from.toDate() && d <= to.toDate();
    });

    const rows = [
      ['=== COLLECTION SUMMARY ==='],
      ['Metric', 'Amount'],
      ['Total Collected', data.collections?.totalCollected ?? 0],
      ['Pending Balance', data.collections?.totalPending ?? 0],
      ['Month Collected', data.collections?.monthCollected ?? 0],
      ['Month Pending', data.collections?.monthPending ?? 0],
      [],

      ['=== STATUS BREAKDOWN ==='],
      ['Status', 'Count', 'Percentage'],
      ...filteredStatus.map(r => [
        String(r.status || '').replace(/_/g, ' '),
        r.count,
        `${r.percentage}%`,
      ]),
      [],

      ['=== PLAN-WISE ANALYTICS ==='],
      ['Plan Group', 'Customers', 'Collected', 'Pending'],
      ...filteredPlan.map(r => [
        r.plan || r.planGroup || 'Unknown',
        r.customerCount ?? r.customers ?? 0,
        r.collected ?? 0,
        r.pending ?? 0,
      ]),
    ];

    const csv = rows
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const fromStr = range?.[0]?.format?.('YYYY-MM-DD') || '';
    const toStr   = range?.[1]?.format?.('YYYY-MM-DD') || '';

    a.href = url;
    a.download = `collection-report-${fromStr}-to-${toStr}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    message.success('Filtered CSV downloaded');
  } catch (err) {
    console.error(err);
    message.error('Failed to export CSV');
  }
};

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div style={{ padding: isMobile ? 14 : 28 }}>

        {/* Header */}
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Typography.Title level={isMobile ? 4 : 2} style={{ margin: 0 }}>
              Collection Reports
            </Typography.Title>
          </Col>
          <Col xs={24} md={12}>
            <Space style={{ width: '100%', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
              <RangePicker
                style={{ width: isMobile ? '100%' : 260 }}
                onChange={setRange}
              />
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleExportCSV}
                style={{ background: '#0f766e', border: 'none', fontWeight: 600 }}
              >
                Export CSV
              </Button>
            </Space>
          </Col>
        </Row>

        <Divider />

        {/* KPI Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)',
          gap: 14,
          marginBottom: 16,
        }}>
          {kpis.map((kpi, i) => (
            <Card key={i} bordered={false}
              style={{ background: kpi.bg, borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
            >
              <Statistic
                title={<span style={{ fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>{kpi.title}</span>}
                value={kpi.value}
                prefix={<span style={{ color: kpi.color }}>{kpi.icon}</span>}
                formatter={(v) => moneyFormatter({ amount: v })}
                valueStyle={{ color: kpi.color, fontSize: isMobile ? 16 : 20, fontWeight: 700 }}
              />
            </Card>
          ))}
        </div>

        <Divider />

        {/* Tables */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="Status Breakdown" bordered={false} style={{ borderRadius: 12 }}>
              <Table
                dataSource={data.statusBreakdown ?? []}
                columns={statusColumns}
                pagination={false}
                rowKey="status"
                size="small"
                scroll={{ x: true }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Plan-wise Analytics" bordered={false} style={{ borderRadius: 12 }}>
              <Table
                dataSource={data.planWise ?? []}
                columns={planColumns}
                pagination={false}
                rowKey={(_, i) => String(i)}
                size="small"
                scroll={{ x: true }}
              />
            </Card>
          </Col>
        </Row>

      </div>
    </DashboardLayout>
  );
}
 