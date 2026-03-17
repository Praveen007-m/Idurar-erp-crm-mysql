/**
 * pages/performance-summary/index.jsx — Webaac Solutions Finance Management
 * Staff "My Performance" page
 *
 * Mobile fixes:
 *  - span={8/12} → xs={24} sm={8/12} responsive cols
 *  - Progress dashboard size reduced on mobile
 *  - Card padding reduced on mobile
 */
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Spin, Alert, Divider,
  Statistic, Progress, Typography, Grid, Space,
} from 'antd';
import {
  DollarCircleOutlined, BarChartOutlined,
  CheckCircleOutlined, SyncOutlined,
  UserOutlined, WarningOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { request } from '@/request';
import useFetch from '@/hooks/useFetch';
import useLanguage from '@/locale/useLanguage';
import { useMoney } from '@/settings';
import { DashboardLayout } from '@/layout';

const { useBreakpoint } = Grid;
const BRAND = '#28a7ab';

const effColor = (e) => e >= 75 ? '#52c41a' : e >= 50 ? '#1890ff' : '#cf1322';
const effLabel = (e, translate) =>
  e > 80 ? translate('Excellent Collection Rate')
  : e > 50 ? translate('Average Collection Rate')
  : translate('Needs Improvement');

export default function PerformanceSummary() {
  const translate        = useLanguage();
  const { moneyFormatter } = useMoney();
  const screens          = useBreakpoint();
  const isMobile         = !screens.md;
  const [loading, setLoading] = useState(true);

  const { result: dashboardData, error } = useFetch(() =>
    request.get({ entity: 'dashboard/staff' })
  );

  useEffect(() => {
    if (dashboardData || error) setLoading(false);
  }, [dashboardData, error]);

  if (loading) return (
    <DashboardLayout>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" />
      </div>
    </DashboardLayout>
  );

  if (error) return (
    <DashboardLayout>
      <Alert message="Error loading performance data" type="error" showIcon style={{ margin: 24 }} />
    </DashboardLayout>
  );

  const data       = dashboardData?.result || {};
  const efficiency = data.performance?.efficiency || 0;

  const collectionCards = [
    {
      title:      translate('Total Collected'),
      value:      data.collections?.totalCollected || 0,
      icon:       <DollarCircleOutlined style={{ color: '#52c41a' }} />,
      color:      '#52c41a',
      bg:         '#f6ffed',
    },
    {
      title:      translate('Pending Amount'),
      value:      data.collections?.totalPending || 0,
      icon:       <SyncOutlined style={{ color: '#faad14' }} />,
      color:      '#faad14',
      bg:         '#fffbe6',
    },
    {
      title:      translate('This Month Collected'),
      value:      data.collections?.monthCollected || 0,
      icon:       <CheckCircleOutlined style={{ color: BRAND }} />,
      color:      BRAND,
      bg:         '#f0fafa',
    },
  ];

  const breakdownItems = [
    {
      title: translate('Active Customers'),
      value: data.customerMetrics?.active    || 0,
      color: '#1890ff',
      icon:  <UserOutlined />,
    },
    {
      title: translate('Fully Paid Customers'),
      value: data.customerMetrics?.completed || 0,
      color: '#52c41a',
      icon:  <CheckCircleOutlined />,
    },
    {
      title: translate('Defaulted Accounts'),
      value: data.customerMetrics?.defaulted || 0,
      color: '#cf1322',
      icon:  <WarningOutlined />,
    },
    {
      title: translate('Upcoming Installments'),
      value: data.installments?.upcoming     || 0,
      color: '#595959',
      icon:  <CalendarOutlined />,
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: isMobile ? '12px 10px' : '24px' }}>

        {/* Title */}
        <Typography.Title
          level={isMobile ? 4 : 3}
          style={{ marginBottom: isMobile ? 14 : 24, marginTop: 0 }}
        >
          {translate('My Performance Summary')}
        </Typography.Title>

        {/* Collection stat cards */}
        <Row gutter={[10, 10]} style={{ marginBottom: isMobile ? 14 : 0 }}>
          {collectionCards.map((card) => (
            <Col xs={24} sm={8} key={card.title}>
              <Card
                bordered={false}
                style={{
                  borderRadius: 10,
                  background:   card.bg,
                  boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
                }}
                styles={{ body: { padding: isMobile ? '14px 16px' : '20px' } }}
              >
                <Statistic
                  title={
                    <span style={{ fontSize: isMobile ? 12 : 14, color: '#8c8c8c' }}>
                      {card.title}
                    </span>
                  }
                  value={card.value}
                  prefix={card.icon}
                  formatter={moneyFormatter}
                  valueStyle={{ color: card.color, fontSize: isMobile ? 18 : 22 }}
                />
              </Card>
            </Col>
          ))}
        </Row>

        <Divider style={{ margin: isMobile ? '14px 0' : '24px 0' }} />

        {/* Efficiency + Breakdown */}
        <Row gutter={[10, 10]}>
          {/* Efficiency */}
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <BarChartOutlined style={{ color: BRAND }} />
                  <span>{translate('Overall Efficiency')}</span>
                </Space>
              }
              bordered={false}
              style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', height: '100%' }}
              styles={{ body: { padding: isMobile ? '16px' : '24px' } }}
            >
              <div style={{ textAlign: 'center', padding: isMobile ? '8px 0' : '16px 0' }}>
                <Progress
                  type="dashboard"
                  percent={efficiency}
                  strokeColor={effColor(efficiency)}
                  format={(p) => `${p}%`}
                  size={isMobile ? 140 : 180}
                />
                <Typography.Title
                  level={isMobile ? 5 : 4}
                  style={{ marginTop: 14, marginBottom: 6, color: effColor(efficiency) }}
                >
                  {effLabel(efficiency, translate)}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: isMobile ? 12 : 13 }}>
                  {translate('Efficiency is calculated as collected amount versus expected installments.')}
                </Typography.Text>
              </div>
            </Card>
          </Col>

          {/* Account breakdown */}
          <Col xs={24} md={12}>
            <Card
              title={translate('Account Actions Breakdown')}
              bordered={false}
              style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', height: '100%' }}
              styles={{ body: { padding: isMobile ? '14px' : '24px' } }}
            >
              <Row gutter={[10, 16]}>
                {breakdownItems.map((item) => (
                  <Col xs={12} key={item.title}>
                    <Card
                      size="small"
                      bordered={false}
                      style={{
                        background:   `${item.color}0f`,
                        borderRadius: 8,
                        border:       `1px solid ${item.color}22`,
                      }}
                      styles={{ body: { padding: '12px' } }}
                    >
                      <div style={{ color: '#8c8c8c', fontSize: 11, marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: isMobile ? 20 : 24, color: item.color }}>
                        {item.value}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        </Row>
      </div>
    </DashboardLayout>
  );
}
