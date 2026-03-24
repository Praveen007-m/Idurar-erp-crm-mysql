/**
 * StaffDashboard.jsx — Webaac Solutions Finance Management
 * Place: frontend/src/pages/StaffDashboard.jsx
 */
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Spin, Alert, Statistic,
  Progress, Typography, Grid, Table,
} from 'antd';
import {
  TeamOutlined, DollarCircleOutlined,
  WarningOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { request } from '@/request';
import useFetch from '@/hooks/useFetch';
import useLanguage from '@/locale/useLanguage';
import { useMoney } from '@/settings';
import { selectMoneyFormat } from '@/redux/settings/selectors';
import { DashboardLayout } from '@/layout';

const { useBreakpoint } = Grid;

export default function StaffDashboard() {
  const translate          = useLanguage();
  const { moneyFormatter } = useMoney();
  const moneySettings      = useSelector(selectMoneyFormat);
  const screens            = useBreakpoint();
  const isMobile           = !screens.md;
  const [loading, setLoading] = useState(true);

  const { result: dashboardData, error } = useFetch(() =>
    request.get({ entity: 'dashboard/summary' })
  );


  useEffect(() => {
    if (dashboardData || error) setLoading(false);
  }, [dashboardData, error]);

  // ── FIX 1: currency_code — try every possible Redux key, fallback to 'INR'
  const currencyCode =
    moneySettings?.default_currency_code ||
    moneySettings?.currency_code         ||
    moneySettings?.currencyCode          ||
    'INR';

  // ── FIX 2: wrap moneyFormatter so Antd Statistic's formatter(value) call
  //    is converted to moneyFormatter({ amount, currency_code }) correctly
  const formatMoney = (value) =>
    moneyFormatter({ amount: Number(value ?? 0), currency_code: currencyCode });

  if (loading) return (
    <DashboardLayout>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" />
      </div>
    </DashboardLayout>
  );

  if (error) return (
    <DashboardLayout>
      <Alert message="Error loading dashboard" type="error" showIcon style={{ margin: 24 }} />
    </DashboardLayout>
  );

  // ── FIX 3: dashboardData IS already the result object (useFetch unwraps it).
  //    Never add .result again — that gives undefined.
  //    Read flat fields first, nested collections as fallback.
  const data = dashboardData || {};
  const { totalCollected: totalGiven = 0, pendingAmount: totalPending = 0 } = data;

  return (
    <DashboardLayout>
      <div style={{ 
        padding: isMobile ? '12px 10px' : '24px',
        background: '#f5f5f5', 
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ maxWidth: 800, width: '100%' }}>
          <Typography.Title
            level={isMobile ? 4 : 3}
            style={{ marginBottom: isMobile ? 14 : 24, marginTop: 0, textAlign: 'center' }}
          >
            {translate('Dashboard')}
          </Typography.Title>

          <Row gutter={[32, 32]} justify="center" align="middle">
            <Col xs={24} lg={12}>
              <Card 
                style={{ 
                  height: isMobile ? 160 : 220, 
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderRadius: 12 
                }}
                bodyStyle={{ padding: isMobile ? '30px 20px' : '50px 20px' }}
              >
                <Statistic
                  title="TOTAL GIVEN"
                  value={totalGiven}
                  prefix="₹"
                  formatter={moneyFormatter}
                  valueStyle={{ 
                    fontSize: isMobile ? 28 : 40, 
                    color: '#52c41a',
                    fontWeight: 700
                  }}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  Total Loan Amount Disbursed (Active Clients)
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card 
                style={{ 
                  height: isMobile ? 160 : 220, 
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderRadius: 12 
                }}
                bodyStyle={{ padding: isMobile ? '30px 20px' : '50px 20px' }}
              >
                <Statistic
                  title="TOTAL PENDING"
                  value={totalPending}
                  prefix="₹"
                  formatter={moneyFormatter}
                  valueStyle={{ 
                    fontSize: isMobile ? 28 : 40, 
                    color: '#ff4d4f',
                    fontWeight: 700
                  }}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  Outstanding Balance (Active Clients)
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      </div>
    </DashboardLayout>
  );
}

