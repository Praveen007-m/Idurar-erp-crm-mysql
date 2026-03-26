/**
 * pages/Reports/index.jsx — Webaac Solutions Finance Management
 * FULLY RESPONSIVE (Mobile-First)
 */

import { useEffect, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Spin,
  Alert,
  Divider,
  Statistic,
  Typography,
  Grid,
  Space,
} from 'antd';

import {
  PieChartOutlined,
  LineChartOutlined,
  DollarCircleOutlined,
  RiseOutlined,
  FallOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

import { request } from '@/request';
import useFetch from '@/hooks/useFetch';
import useLanguage from '@/locale/useLanguage';
import { useMoney } from '@/settings';
import { DashboardLayout } from '@/layout';

const { useBreakpoint } = Grid;

export default function Reports() {
  const translate = useLanguage();
  const { moneyFormatter } = useMoney();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(true);

  const { result: dashboardData, error } = useFetch(() =>
    request.get({ entity: 'reports' })
  );

  useEffect(() => {
    if (dashboardData || error) setLoading(false);
  }, [dashboardData, error]);

  const data = dashboardData?.result ?? dashboardData ?? {};

  if (loading)
    return (
      <DashboardLayout>
        <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />
      </DashboardLayout>
    );

  if (error)
    return (
      <DashboardLayout>
        <Alert message="Error loading reports" type="error" showIcon style={{ margin: 24 }} />
      </DashboardLayout>
    );

  // ─────────────────────────────────────────────
  // DEFAULTED AMOUNT
  // ─────────────────────────────────────────────

  const defaultedAmount =
    (data.statusBreakdown || [])
      .filter(s => String(s.status).toLowerCase() === 'default')
      .reduce((sum, s) => sum + Number(s.total || 0), 0);

  // ─────────────────────────────────────────────
  // STATUS FORMAT
  // ─────────────────────────────────────────────

  const formatStatus = (v) => {
    const w = String(v || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .map(x => x[0]?.toUpperCase() + x.slice(1))
      .join(' ');

    const colors = {
      Paid: '#52c41a',
      Late: '#fa8c16',
      Partial: '#faad14',
      Default: '#ff4d4f',
      'Not Started': '#8c8c8c',
    };

    return <span style={{ color: colors[w] || '#595959', fontWeight: 500 }}>{w}</span>;
  };

  // ─────────────────────────────────────────────
  // TABLE COLUMNS
  // ─────────────────────────────────────────────

  const statusColumns = [
    { title: translate('Status'), dataIndex: 'status', key: 'status', render: formatStatus },
    { title: translate('Count'), dataIndex: 'count', key: 'count', align: 'right' },
    {
      title: translate('Percentage'),
      dataIndex: 'percentage',
      key: 'percentage',
      align: 'right',
      render: v => `${v}%`,
    },
  ];

  const planColumns = [
    {
      title: translate('Plan Group'),
      dataIndex: 'planGroup',
      key: 'planGroup',
      render: v => v || 'Unknown',
    },
    {
      title: translate('Customers'),
      dataIndex: 'customers',
      key: 'customers',
      align: 'right',
    },
    {
      title: translate('Collected'),
      dataIndex: 'collected',
      key: 'collected',
      align: 'right',
      render: v => (
        <span style={{ color: '#52c41a' }}>
          {moneyFormatter({ amount: v ?? 0 })}
        </span>
      ),
    },
    {
      title: translate('Pending'),
      dataIndex: 'pending',
      key: 'pending',
      align: 'right',
      render: v => (
        <span style={{ color: '#ff4d4f' }}>
          {moneyFormatter({ amount: v ?? 0 })}
        </span>
      ),
    },
  ];

  // ─────────────────────────────────────────────
  // STAT CARDS
  // ─────────────────────────────────────────────

  const statCards = [
    {
      title: translate('Total Collected'),
      value: data.collections?.totalCollected ?? 0,
      icon: <DollarCircleOutlined style={{ color: '#52c41a' }} />,
      color: '#52c41a',
    },
    {
      title: translate('Pending Balance'),
      value: data.collections?.totalPending ?? 0,
      icon: <FallOutlined style={{ color: '#ff4d4f' }} />,
      color: '#ff4d4f',
    },
    {
      title: translate('Month Collected'),
      value: data.collections?.monthCollected ?? 0,
      icon: <RiseOutlined style={{ color: '#1890ff' }} />,
      color: '#1890ff',
    },
    {
      title: translate('Month Pending'),
      value: data.collections?.monthPending ?? 0,
      icon: <LineChartOutlined style={{ color: '#faad14' }} />,
      color: '#faad14',
    },
    {
      title: translate('Defaulted Amount'),
      value: defaultedAmount,
      icon: <ExclamationCircleOutlined style={{ color: '#cf1322' }} />,
      color: '#cf1322',
    },
  ];

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div style={{ padding: isMobile ? '14px 10px' : '24px' }}>
        <Typography.Title
          level={isMobile ? 4 : 3}
          style={{ marginBottom: isMobile ? 14 : 24, marginTop: 0 }}
        >
          {translate('Collection Reports')}
        </Typography.Title>

        {/* ⭐ RESPONSIVE STAT CARDS */}

        <Row gutter={[12, 12]}>
          {statCards.map((card, idx) => (
            <Col
              key={idx}
              xs={24}   // mobile
              sm={12}   // small tablet
              md={8}    // tablet
              lg={6}    // desktop
              xl={4}    // large desktop
            >
              <Card
                size="small"
                bordered={false}
                style={{
                  borderRadius: 10,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  height: '100%',
                }}
                styles={{
                  body: { padding: isMobile ? '14px 12px' : '20px 16px' },
                }}
              >
                <Statistic
                  title={
                    <span style={{ fontSize: isMobile ? 11 : 13, color: '#8c8c8c' }}>
                      {card.title}
                    </span>
                  }
                  value={card.value}
                  prefix={card.icon}
                  formatter={val => moneyFormatter({ amount: val })}
                  valueStyle={{
                    color: card.color,
                    fontSize: isMobile ? 18 : 22,
                    fontWeight: 700,
                  }}
                />
              </Card>
            </Col>
          ))}
        </Row>

        <Divider style={{ margin: isMobile ? '14px 0' : '24px 0' }} />

        {/* ⭐ TABLES */}

        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <PieChartOutlined />
                  <span style={{ fontSize: isMobile ? 13 : 15 }}>
                    {translate('Status Breakdown')}
                  </span>
                </Space>
              }
              bordered={false}
              size="small"
              style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
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

          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <PieChartOutlined />
                  <span style={{ fontSize: isMobile ? 13 : 15 }}>
                    {translate('Plan-wise Analytics')}
                  </span>
                </Space>
              }
              bordered={false}
              size="small"
              style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <Table
                dataSource={data.planWise ?? []}
                columns={planColumns}
                pagination={false}
                rowKey="planGroup"
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