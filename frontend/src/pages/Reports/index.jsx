/**
 * pages/reports/index.jsx — Webaac Solutions Finance Management
 *
 * Mobile fixes:
 *  - Replaced span={6}/span={12} with xs/sm/md responsive props
 *  - Table scroll={{ x: true }} for horizontal scroll on mobile
 *  - Statistic font sizes reduced on small screens
 *  - Padding adjusted for mobile
 */
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Table, Spin, Alert,
  Divider, Statistic, Typography, Grid,
} from 'antd';
import {
  PieChartOutlined,
  LineChartOutlined,
  DollarCircleOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import { request } from '@/request';
import useFetch from '@/hooks/useFetch';
import useLanguage from '@/locale/useLanguage';
import { useMoney } from '@/settings';
import { DashboardLayout } from '@/layout';

const { useBreakpoint } = Grid;

export default function Reports() {
  const translate        = useLanguage();
  const { moneyFormatter } = useMoney();
  const screens          = useBreakpoint();
  const isMobile         = !screens.md;

  const [loading, setLoading] = useState(true);

  const { result: dashboardData, error } = useFetch(() =>
    request.get({ entity: 'reports' })
  );

  useEffect(() => {
    if (dashboardData || error) setLoading(false);
  }, [dashboardData, error]);

  const data = dashboardData?.result || {};

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;
  if (error)   return <Alert message="Error loading reports" type="error" showIcon style={{ margin: 24 }} />;

  // ── Table columns ─────────────────────────────────────────────────────────
  const statusColumns = [
    {
      title:     translate('Status'),
      dataIndex: 'status',
      key:       'status',
      render:    (v) => <span style={{ textTransform: 'capitalize' }}>{v}</span>,
    },
    {
      title:     translate('Count'),
      dataIndex: 'count',
      key:       'count',
      align:     'right',
    },
    {
      title:     translate('Percentage'),
      dataIndex: 'percentage',
      key:       'percentage',
      align:     'right',
      render:    (v) => `${v}%`,
    },
  ];

  const planColumns = [
    {
      title:     translate('Plan Group'),
      dataIndex: 'plan',
      key:       'plan',
      render:    (_, _r, i) => `Plan Group ${i + 1}`,
    },
    {
      title:     translate('Customers'),
      dataIndex: 'customerCount',
      key:       'customerCount',
      align:     'right',
    },
  ];

  // ── Stat cards config ─────────────────────────────────────────────────────
  const statCards = [
    {
      title:      translate('Total Collected'),
      value:      data.collections?.totalCollected || 0,
      icon:       <DollarCircleOutlined style={{ color: '#52c41a' }} />,
      color:      '#52c41a',
      valueStyle: { color: '#52c41a', fontSize: isMobile ? 20 : 24 },
    },
    {
      title:      translate('Pending Balance'),
      value:      data.collections?.totalPending || 0,
      icon:       <FallOutlined style={{ color: '#ff4d4f' }} />,
      color:      '#ff4d4f',
      valueStyle: { color: '#ff4d4f', fontSize: isMobile ? 20 : 24 },
    },
    {
      title:      translate('Month Collected'),
      value:      data.collections?.monthCollected || 0,
      icon:       <RiseOutlined style={{ color: '#1890ff' }} />,
      color:      '#1890ff',
      valueStyle: { color: '#1890ff', fontSize: isMobile ? 20 : 24 },
    },
    {
      title:      translate('Month Pending'),
      value:      data.collections?.monthPending || 0,
      icon:       <LineChartOutlined style={{ color: '#faad14' }} />,
      color:      '#faad14',
      valueStyle: { color: '#faad14', fontSize: isMobile ? 20 : 24 },
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: isMobile ? '14px 10px' : '24px' }}>
        {/* ── Heading ── */}
        <Typography.Title
          level={isMobile ? 4 : 3}
          style={{ marginBottom: isMobile ? 14 : 24, marginTop: 0 }}
        >
          {translate('Collection Reports')}
        </Typography.Title>

        {/* ── Stat Cards ── */}
        <Row gutter={[12, 12]} style={{ marginBottom: 4 }}>
          {statCards.map((card, idx) => (
            <Col key={idx} xs={12} sm={12} md={6}>
              <Card
                size="small"
                bordered={false}
                style={{
                  borderRadius: 10,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  height: '100%',
                }}
                styles={{ body: { padding: isMobile ? '14px 12px' : '20px 16px' } }}
              >
                <Statistic
                  title={
                    <span style={{ fontSize: isMobile ? 11 : 13, color: '#8c8c8c' }}>
                      {card.title}
                    </span>
                  }
                  value={card.value}
                  prefix={card.icon}
                  formatter={moneyFormatter}
                  valueStyle={card.valueStyle}
                />
              </Card>
            </Col>
          ))}
        </Row>

        <Divider style={{ margin: isMobile ? '14px 0' : '24px 0' }} />

        {/* ── Tables ── */}
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <PieChartOutlined />
                  <span style={{ fontSize: isMobile ? 13 : 15 }}>{translate('Status Breakdown')}</span>
                </Space>
              }
              bordered={false}
              size="small"
              style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <Table
                dataSource={data.statusBreakdown || []}
                columns={statusColumns}
                pagination={false}
                rowKey="status"
                size="small"
                scroll={{ x: true }}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <PieChartOutlined />
                  <span style={{ fontSize: isMobile ? 13 : 15 }}>{translate('Plan-wise Analytics')}</span>
                </Space>
              }
              bordered={false}
              size="small"
              style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <Table
                dataSource={data.planWise || []}
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

// Needed for the Space import used above
import { Space } from 'antd';
