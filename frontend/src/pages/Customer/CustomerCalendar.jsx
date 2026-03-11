import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  UserOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Calendar,
  Card,
  Col,
  Divider,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  Modal,
  Table,
  message,
} from 'antd';
import { PageHeader } from '@ant-design/pro-layout';
import dayjs from 'dayjs';

import { ErpLayout } from '@/layout';
import { crud } from '@/redux/crud/actions';
import { selectListItems, selectReadItem } from '@/redux/crud/selectors';
import { useDispatch, useSelector } from 'react-redux';
import useLanguage from '@/locale/useLanguage';
import { useMoney, useDate } from '@/settings';

const BOX_BORDER = '#28a7ab';
const BOX_BG = '#e9f7f8';
const BOX_TEXT = '#117a8b';

// Status colors for calendar events
const statusColors = {
  paid: '#52c41a',        // green - fully paid
  late: '#faad14',        // yellow - late payment
  partial: '#fa8c16',     // orange - partial payment
  default: '#ff4d4f',     // red - overdue/unpaid
  not_started: '#d9d9d9', // grey - future payment
};

export default function CustomerCalendar() {
  const { clientId } = useParams();
  const translate = useLanguage();
  const { moneyFormatter } = useMoney();
  const { dateFormat } = useDate();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { result: client, isLoading: isClientLoading } = useSelector(selectReadItem);
  const { result: repaymentsResult, isLoading: isRepaymentsLoading } = useSelector(selectListItems);

  const [calendarMonth, setCalendarMonth] = useState(dayjs());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRepayment, setSelectedRepayment] = useState(null);

  useEffect(() => {
    // Fetch client details
    dispatch(crud.read({ entity: 'client', id: clientId }));
    // Fetch repayments for this client
    fetchRepayments();
    
    // Listen for repayment updates
    const handleRepaymentUpdate = () => {
      fetchRepayments();
    };
    
    window.addEventListener('repayment-updated', handleRepaymentUpdate);
    
    return () => {
      window.removeEventListener('repayment-updated', handleRepaymentUpdate);
    };
  }, [clientId]);

  const fetchRepayments = () => {
    dispatch(crud.list({ 
      entity: 'repayment', 
      options: { filter: 'client', equal: clientId, items: 200, page: 1 } 
    }));
  };

  // Transform repayments to calendar events
  const calendarEvents = useMemo(() => {
    const repayments = repaymentsResult?.items || [];
    return repayments.map((repayment) => {
      const status = repayment.paymentStatus || repayment.status;
      const eventDate = dayjs(repayment.date);
      
      // Determine color based on status
      let color = statusColors.not_started;
      if (status === 'paid') color = statusColors.paid;
      else if (status === 'late') color = statusColors.late;
      else if (status === 'partial') color = statusColors.partial;
      else if (status === 'default') color = statusColors.default;
      else if (status === 'not-paid') {
        const today = dayjs().startOf('day');
        if (eventDate.isBefore(today)) {
          color = statusColors.default;
        }
      }

      return {
        id: repayment._id,
        title: `${moneyFormatter({ amount: repayment.amount })} - ${translate(status)}`,
        date: eventDate,
        color,
        repayment,
        status,
      };
    });
  }, [repaymentsResult, moneyFormatter, translate]);

  // Group events by date for calendar display
  const eventsByDate = useMemo(() => {
    const map = {};
    calendarEvents.forEach((event) => {
      const dateKey = event.date.format('YYYY-MM-DD');
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(event);
    });
    return map;
  }, [calendarEvents]);

  // Calculate totals
  const totals = useMemo(() => {
    const repayments = repaymentsResult?.items || [];
    const paid = repayments
      .filter((r) => r.status === 'paid' || r.paymentStatus === 'paid')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    
    const pending = repayments
      .filter((r) => r.status !== 'paid' && r.paymentStatus !== 'paid')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return { paid, pending, total: paid + pending };
  }, [repaymentsResult]);

  // Handle calendar cell click
  const handleDateClick = (date) => {
    const dateKey = date.format('YYYY-MM-DD');
    const events = eventsByDate[dateKey];
    if (events && events.length > 0) {
      setSelectedRepayment(events[0].repayment);
      setModalOpen(true);
    }
  };

  const repaymentColumns = [
    {
      title: translate('Date'),
      dataIndex: 'date',
      key: 'date',
      render: (value) => dayjs(value).format(dateFormat),
    },
    {
      title: translate('Amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (value) => moneyFormatter({ amount: value }),
    },
    {
      title: translate('Principal'),
      dataIndex: 'principal',
      key: 'principal',
      render: (value) => moneyFormatter({ amount: value || 0 }),
    },
    {
      title: translate('Interest'),
      dataIndex: 'interest',
      key: 'interest',
      render: (value) => moneyFormatter({ amount: value || 0 }),
    },
    {
      title: translate('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const paymentStatus = record.paymentStatus || status;
        let color = 'default';
        if (paymentStatus === 'paid') color = 'green';
        else if (paymentStatus === 'late') color = 'gold';
        else if (paymentStatus === 'partial') color = 'orange';
        else if (paymentStatus === 'default') color = 'red';
        
        return <Tag color={color}>{translate(paymentStatus)}</Tag>;
      },
    },
  ];

  return (
    <ErpLayout>
      <Spin spinning={isClientLoading}>
        <PageHeader
          onBack={() => navigate('/customer')}
          backIcon={<ArrowLeftOutlined />}
          title={
            <Space>
              <CalendarOutlined style={{ color: BOX_TEXT }} />
              {translate('Repayment Calendar')}
            </Space>
          }
          ghost={false}
          extra={[
            <Button 
              key="view-list" 
              onClick={() => navigate(`/repayment/client/${clientId}`)}
            >
              {translate('View List')}
            </Button>,
          ]}
          style={{
            padding: '18px 14px',
            borderRadius: 10,
            background: 'linear-gradient(90deg, rgba(40,167,171,0.14) 0%, rgba(24,144,255,0.06) 100%)',
            marginBottom: 12,
          }}
        />

        {/* Client Info Card */}
        <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={8}>
              <Space>
                <Avatar 
                  size={48} 
                  icon={<UserOutlined />} 
                  style={{ background: BOX_BORDER }}
                />
                <div>
                  <Typography.Text type="secondary">{translate('Client')}</Typography.Text>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>
                    {client?.name || '-'}
                  </div>
                </div>
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <div>
                <Typography.Text type="secondary">
                  <DollarOutlined /> {translate('Loan Amount')}
                </Typography.Text>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  {moneyFormatter({ amount: client?.loanAmount })}
                </div>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div>
                <Typography.Text type="secondary">
                  <ClockCircleOutlined /> {translate('Term')}
                </Typography.Text>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  {client?.term} {translate('installments')}
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        {/* Summary Cards */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />
                <div>
                  <Typography.Text type="secondary">{translate('Paid')}</Typography.Text>
                  <div style={{ fontWeight: 600, color: '#52c41a' }}>
                    {moneyFormatter({ amount: totals.paid })}
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#fff2e8', borderColor: '#ffbb96' }}>
              <Space>
                <ExclamationCircleOutlined style={{ color: '#fa8c16', fontSize: 24 }} />
                <div>
                  <Typography.Text type="secondary">{translate('Pending')}</Typography.Text>
                  <div style={{ fontWeight: 600, color: '#fa8c16' }}>
                    {moneyFormatter({ amount: totals.pending })}
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
              <Space>
                <DollarOutlined style={{ color: '#1890ff', fontSize: 24 }} />
                <div>
                  <Typography.Text type="secondary">{translate('Total')}</Typography.Text>
                  <div style={{ fontWeight: 600, color: '#1890ff' }}>
                    {moneyFormatter({ amount: totals.total })}
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>

        {/* Legend */}
        <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              flexWrap: 'wrap',
              gap: '12px 16px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: statusColors.paid, borderRadius: 3 }} />
              {translate('Paid')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: statusColors.late, borderRadius: 3 }} />
              {translate('Late')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: statusColors.partial, borderRadius: 3 }} />
              {translate('Partial')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: statusColors.default, borderRadius: 3 }} />
              {translate('Default')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: statusColors.not_started, borderRadius: 3 }} />
              {translate('Not Started')}
            </span>
          </div>
        </Card>

        {/* Calendar */}
        <Card bordered={false} style={{ borderRadius: 12 }}>
          <Spin spinning={isRepaymentsLoading}>
            <Calendar
              value={calendarMonth}
              onPanelChange={(value) => setCalendarMonth(value)}
              onSelect={handleDateClick}
              fullCellRender={(date) => {
                if (!date.isSame(calendarMonth, 'month')) {
                  return <div style={{ minHeight: 100, padding: 8, background: '#fafafa' }} />;
                }

                const dateKey = date.format('YYYY-MM-DD');
                const dayEvents = eventsByDate[dateKey] || [];
                const visible = dayEvents.slice(0, 2);
                const hiddenCount = Math.max(dayEvents.length - visible.length, 0);

                return (
                  <div
                    style={{
                      minHeight: 100,
                      padding: 6,
                      borderRadius: 8,
                      border: dayEvents.length ? '1px solid rgba(40,167,171,0.28)' : '1px solid #f0f0f0',
                      background: dayEvents.length ? '#fcffff' : '#ffffff',
                      cursor: dayEvents.length ? 'pointer' : 'default',
                    }}
                    onClick={(e) => {
                      if (dayEvents.length) {
                        e.stopPropagation();
                        handleDateClick(date);
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography.Text strong style={{ fontSize: 12 }}>
                        {date.date()}
                      </Typography.Text>
                      {dayEvents.length ? (
                        <Badge
                          count={dayEvents.length}
                          style={{ backgroundColor: BOX_BORDER, boxShadow: 'none', fontSize: 10 }}
                        />
                      ) : null}
                    </div>
                    <Space direction="vertical" size={2} style={{ width: '100%', marginTop: 4 }}>
                      {visible.map((event) => (
                        <div
                          key={event.id}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: event.color,
                            color: '#ffffff',
                            fontSize: 10,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                          }}
                        >
                          {moneyFormatter({ amount: event.repayment.amount })}
                        </div>
                      ))}
                      {hiddenCount > 0 ? (
                        <Typography.Text style={{ color: BOX_TEXT, fontSize: 10 }}>
                          +{hiddenCount} {translate('more')}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  </div>
                );
              }}
            />
          </Spin>
        </Card>

        {/* Repayment Details Modal */}
        <Modal
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={[
            <Button key="close" onClick={() => setModalOpen(false)}>
              {translate('Close')}
            </Button>,
            <Button 
              key="view-full" 
              type="primary" 
              onClick={() => {
                setModalOpen(false);
                navigate(`/repayment/client/${clientId}`);
              }}
            >
              {translate('View Full Details')}
            </Button>,
          ]}
          width={window.innerWidth < 768 ? '95%' : 600}
          title={translate('Repayment Details')}
        >
          {selectedRepayment && (
            <div>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Typography.Text type="secondary">{translate('Date')}</Typography.Text>
                  <div>{dayjs(selectedRepayment.date).format(dateFormat)}</div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">{translate('Amount')}</Typography.Text>
                  <div>{moneyFormatter({ amount: selectedRepayment.amount })}</div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">{translate('Principal')}</Typography.Text>
                  <div>{moneyFormatter({ amount: selectedRepayment.principal || 0 })}</div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">{translate('Interest')}</Typography.Text>
                  <div>{moneyFormatter({ amount: selectedRepayment.interest || 0 })}</div>
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">{translate('Status')}</Typography.Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color={
                      selectedRepayment.paymentStatus === 'paid' ? 'green' :
                      selectedRepayment.paymentStatus === 'late' ? 'gold' :
                      selectedRepayment.paymentStatus === 'partial' ? 'orange' :
                      selectedRepayment.paymentStatus === 'default' ? 'red' : 'default'
                    }>
                      {translate(selectedRepayment.paymentStatus || selectedRepayment.status)}
                    </Tag>
                  </div>
                </Col>
              </Row>
            </div>
          )}
        </Modal>
      </Spin>
    </ErpLayout>
  );
}

