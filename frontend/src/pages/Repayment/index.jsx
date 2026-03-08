import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowLeftOutlined,
  RedoOutlined,
  HistoryOutlined,
  CalendarOutlined,
  UserOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Calendar,
  Card,
  Col,
  Divider,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Table,
  Typography,
} from 'antd';
import { PageHeader } from '@ant-design/pro-layout';
import dayjs from 'dayjs';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { ErpLayout } from '@/layout';
import { crud } from '@/redux/crud/actions';
import { selectListItems } from '@/redux/crud/selectors';
import { request } from '@/request';
import useLanguage from '@/locale/useLanguage';
import { useDate, useMoney } from '@/settings';
import useRole from '@/hooks/useRole';

const BOX_BORDER = '#28a7ab';
const BOX_BG = '#e9f7f8';
const BOX_TEXT = '#117a8b';
const HEADER_BG = 'linear-gradient(90deg, rgba(40,167,171,0.14) 0%, rgba(24,144,255,0.06) 100%)';

const STATUS_COLOR = {
  pending: "#d9d9d9",      // grey
  paid: "#52c41a",         // green
  late: "#faad14",         // yellow
  overdue: "#ff4d4f",      // red
  "not-paid": "#ff4d4f"    // red - same as overdue for unpaid status
};

export default function Repayment() {
  const translate = useLanguage();
  const { moneyFormatter } = useMoney();
  const { dateFormat } = useDate();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { result: listResult, isLoading } = useSelector(selectListItems);
  // Ensure clients is always an array to prevent "clients.filter is not a function" error
  const clients = Array.isArray(listResult?.items) ? listResult.items : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(dayjs());
  const [modalOpen, setModalOpen] = useState(false);
  const [activeClient, setActiveClient] = useState(null);
  const [clientRepayments, setClientRepayments] = useState([]);
  const [repaymentLoading, setRepaymentLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [repayments, setRepayments] = useState([]);

  const loadClients = () => {
    dispatch(crud.list({ entity: 'client', options: { page: 1, items: 100 } }));
  };

  useEffect(() => {
    loadClients();
    loadRepayments();
    
    // Listen for repayment updates from ClientRepayment page
    const handleRepaymentUpdate = () => {
      loadRepayments();
    };
    
    window.addEventListener('repayment-updated', handleRepaymentUpdate);
    
    return () => {
      window.removeEventListener('repayment-updated', handleRepaymentUpdate);
    };
  }, []);

  const calculateTotalRepayment = (record) => {
    const principalAmount = Number(record?.loanAmount || 0);
    const monthlyRate = Number(record?.interestRate || 0) / 100;
    const installments = parseInt(record?.term, 10);

    if (!principalAmount || Number.isNaN(installments) || installments <= 0) return 0;

    let numMonths = installments;
    if (record?.repaymentType === 'Weekly') numMonths = installments / 4;
    else if (record?.repaymentType === 'Daily') numMonths = installments / 30;

    if (record?.interestType === 'flat') {
      return principalAmount + principalAmount * monthlyRate * numMonths;
    }

    const periodRate = monthlyRate * (numMonths / installments);
    if (periodRate <= 0) return principalAmount;

    const emi =
      (principalAmount * periodRate * Math.pow(1 + periodRate, installments)) /
      (Math.pow(1 + periodRate, installments) - 1);

    return emi * installments;
  };

  const getDueDatesForClientInMonth = (client, monthValue) => {
    const term = parseInt(client?.term, 10);
    if (!client?.startDate || Number.isNaN(term) || term <= 0) return [];

    const monthStart = monthValue.startOf('month');
    const monthEnd = monthValue.endOf('month');
    const startDate = dayjs(client.startDate);
    const dueDates = [];

    let unit = 'month';
    if (client?.repaymentType === 'Weekly') unit = 'week';
    if (client?.repaymentType === 'Daily') unit = 'day';

    for (let i = 1; i <= term; i += 1) {
      const dueDate = startDate.add(i, unit);
      if (dueDate.isAfter(monthEnd)) break;
      if (dueDate.isBefore(monthStart)) continue;
      dueDates.push(dueDate.date());
    }

    return dueDates;
  };

  const filteredClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      const matchName = !query || (client?.name || '').toLowerCase().includes(query);
      const matchStatus = statusFilter === 'all' || client?.status === statusFilter;
      return matchName && matchStatus;
    });
  }, [clients, searchTerm, statusFilter]);

  // Filter clients for staff users - only show their assigned clients
  const filteredClientsByRole = useMemo(() => {
    // This is already handled in the backend, but we can also filter on frontend for extra safety
    return filteredClients;
  }, [filteredClients]);

  const clientsByDay = useMemo(() => {
    const map = {};
    filteredClientsByRole.forEach((client) => {
      const dueDates = getDueDatesForClientInMonth(client, calendarMonth);
      dueDates.forEach((dayNumber) => {
        if (!map[dayNumber]) map[dayNumber] = [];
        map[dayNumber].push(client);
      });
    });
    return map;
  }, [filteredClientsByRole, calendarMonth]);

  const fetchClientRepayments = async (clientId) => {
    setRepaymentLoading(true);
    const response = await request.list({
      entity: 'repayment',
      options: { filter: 'client', equal: clientId, items: 200, page: 1 },
    });
    setRepaymentLoading(false);
    if (response?.success) {
      setClientRepayments(response?.result || []);
      return;
    }
    setClientRepayments([]);
  };

  const loadRepayments = async () => {
    const response = await request.list({
      entity: "repayment",
      options: { items: 500, page: 1 }
    });

    if (response?.success) {
      setRepayments(response.result || []);
    }
  };

  const repaymentMap = useMemo(() => {
    const map = new Map();

    if (!repayments || !Array.isArray(repayments)) return map;

    repayments.forEach((item) => {
      const clientId = item.client?._id || item.client;
      const key = `${clientId}-${dayjs(item.date).format("YYYY-MM-DD")}`;
      map.set(key, item.status);
    });

    return map;
  }, [repayments]);

const getPaymentStatus = useCallback((client, date) => {
    const key = `${client._id}-${date.format("YYYY-MM-DD")}`;
    const repaymentStatus = repaymentMap.get(key);
    
    const today = dayjs().startOf('day');
    const currentDate = date.startOf('day');

    // If explicitly marked as paid, return green
    if (repaymentStatus === "paid") return "paid";
    
    // If explicitly marked as late payment, return late (yellow)
    if (repaymentStatus === "late payment") return "late";
    
    // If explicitly marked as not-paid, check date for red (overdue) or grey (upcoming)
    if (repaymentStatus === "not-paid") {
      if (currentDate.isBefore(today)) {
        return "overdue"; // Red - overdue unpaid
      }
      return "pending"; // Grey - upcoming unpaid
    }
    
    // Fallback for missing explicit status - use date-based logic
    if (currentDate.isBefore(today)) {
      return "overdue";
    }

    return "pending";
  }, [repaymentMap]);

  const openDuesModal = async (client) => {
    setActiveClient(client);
    setModalOpen(true);
    await fetchClientRepayments(client._id);
  };

  const paidAmount = useMemo(() => {
    const repaymentsArray = Array.isArray(clientRepayments) ? clientRepayments : [];
    return repaymentsArray
      .filter((item) => item?.status === 'paid')
      .reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  }, [clientRepayments]);

  const totalRepayment = useMemo(() => {
    if (!activeClient) return 0;
    return calculateTotalRepayment(activeClient);
  }, [activeClient]);

  const dueAmount = Math.max(totalRepayment - paidAmount, 0);
  const totalDueClients = Object.values(clientsByDay).reduce((count, dayItems) => count + dayItems.length, 0);

  const repaymentColumns = [
    {
      title: translate('Date'),
      dataIndex: 'date',
      render: (value) => dayjs(value).format(dateFormat),
    },
    {
      title: translate('Amount'),
      dataIndex: 'amount',
      render: (value) => moneyFormatter({ amount: value }),
    },
    {
      title: translate('Status'),
      dataIndex: 'status',
      render: (value) => {
        let color = 'default';
        if (value === 'paid') color = 'green';
        else if (value === 'not-paid') color = 'red';
        else if (value === 'late payment') color = 'gold';

        return <Tag color={color}>{translate(value)}</Tag>;
      },
    },
  ];

  return (
    <ErpLayout>
      <PageHeader
        onBack={() => window.history.back()}
        backIcon={<ArrowLeftOutlined />}
        title={
          <Space>
            <CalendarOutlined style={{ color: BOX_TEXT }} />
            {translate('Loans Calendar')}
          </Space>
        }
        ghost={false}
        extra={[
          <Input
            key="search-clients"
            allowClear
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={translate('search')}
            value={searchTerm}
            style={{ width: 210 }}
          />,
          <Select
            key="status-filter"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 150 }}
            options={[
              { label: translate('all'), value: 'all' },
              { label: translate('active'), value: 'active' },
              { label: translate('paid'), value: 'paid' },
              { label: translate('defaulted'), value: 'defaulted' },
            ]}
          />,
          <Button key="refresh-clients" icon={<RedoOutlined />} onClick={loadClients}>
            {translate('Refresh')}
          </Button>,
        ]}
        style={{
          padding: '18px 14px',
          borderRadius: 10,
          background: HEADER_BG,
          marginBottom: 12,
        }}
      />

      <Spin spinning={isLoading}>
        <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#f4fbfc' }}>
              <Space>
                <Avatar size={32} icon={<UserOutlined />} style={{ background: BOX_BORDER }} />
                <div>
                  <Typography.Text type="secondary">{translate('Clients in View')}</Typography.Text>
                  <div style={{ fontWeight: 600 }}>{filteredClients.length}</div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#f4fbfc' }}>
              <Space>
                <Avatar size={32} icon={<CalendarOutlined />} style={{ background: '#1890ff' }} />
                <div>
                  <Typography.Text type="secondary">{translate('Due Entries This Month')}</Typography.Text>
                  <div style={{ fontWeight: 600 }}>{totalDueClients}</div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" bordered={false} style={{ background: '#f4fbfc' }}>
              <Space>
                <Avatar size={32} icon={<DollarOutlined />} style={{ background: '#13a78f' }} />
                <div>
                  <Typography.Text type="secondary">{translate('Month')}</Typography.Text>
                  <div style={{ fontWeight: 600 }}>{calendarMonth.format('MMMM YYYY')}</div>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card bordered={false} style={{ borderRadius: 12 }}>
          {/* Legend */}
          <Row
            gutter={16}
            style={{
              marginBottom: 20,
              background: "#fafafa",
              padding: "10px 16px",
              borderRadius: 6,
              border: "1px solid #f0f0f0"
            }}
          >
            <Col>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: "#52c41a",
                    borderRadius: 3,
                    display: "inline-block"
                  }}
                />
                Paid
              </span>
            </Col>

            <Col>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: "#faad14",
                    borderRadius: 3,
                    display: "inline-block"
                  }}
                />
                Pending
              </span>
            </Col>

            <Col>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: "#ff4d4f",
                    borderRadius: 3,
                    display: "inline-block"
                  }}
                />
                Overdue
              </span>
            </Col>

            <Col>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: "#d9d9d9",
                    borderRadius: 3,
                    display: "inline-block"
                  }}
                />
                Defaulted
              </span>
            </Col>
          </Row>
          <Calendar
            value={calendarMonth}
            onPanelChange={(value) => setCalendarMonth(value)}
            fullCellRender={(date) => {
              if (!date.isSame(calendarMonth, 'month')) {
                return <div style={{ minHeight: 122, padding: 8, background: '#fafafa' }} />;
              }

              const dayClients = clientsByDay[date.date()] || [];
              const visible = dayClients.slice(0, 3);
              const hiddenCount = Math.max(dayClients.length - visible.length, 0);

              return (
                <div
                  style={{
                    minHeight: 122,
                    padding: 8,
                    borderRadius: 8,
                    border: dayClients.length ? '1px solid rgba(40,167,171,0.28)' : '1px solid #f0f0f0',
                    background: dayClients.length ? '#fcffff' : '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography.Text strong style={{ fontSize: 12 }}>
                      {date.date()}
                    </Typography.Text>
                    {dayClients.length ? (
                      <Badge
                        count={dayClients.length}
                        style={{ backgroundColor: BOX_BORDER, boxShadow: 'none', fontSize: 10 }}
                      />
                    ) : null}
                  </div>
                  <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                    {visible.map((client) => {
                      const status = getPaymentStatus(client, date);
                      const bgColor = STATUS_COLOR[status];
                      
                      const textColor = (status === 'pending' || status === 'late') 
                        ? 'rgba(0, 0, 0, 0.88)' 
                        : '#ffffff';

                      return (
                        <Button
                          key={`${client._id}-${date.date()}`}
                          block
                          size="small"
                          onClick={() => openDuesModal(client)}
                          style={{
                            borderColor: bgColor,
                            background: bgColor,
                            color: textColor,
                            textAlign: "left",
                            height: 26,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          {client?.name}
                        </Button>
                      );
                    })}
                    {hiddenCount > 0 ? (
                      <Typography.Text style={{ color: BOX_TEXT, fontSize: 12 }}>
                        +{hiddenCount} {translate('more')}
                      </Typography.Text>
                    ) : null}
                  </Space>
                </div>
              );
            }}
          />
        </Card>
      </Spin>

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={800}
        style={{ top: 24 }}
        title={
          <Space>
            <HistoryOutlined />
            {translate('Show Dues')}
          </Space>
        }
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 12 }}>
          <Col xs={24} md={8}>
            <Typography.Text type="secondary">{translate('Client')}</Typography.Text>
            <div>{activeClient?.name || '-'}</div>
          </Col>
          <Col xs={24} md={8}>
            <Typography.Text type="secondary">{translate('Total Repayment')}</Typography.Text>
            <div>{moneyFormatter({ amount: totalRepayment })}</div>
          </Col>
          <Col xs={24} md={8}>
            <Typography.Text type="secondary">{translate('Due Amount')}</Typography.Text>
            <div style={{ color: '#d4380d', fontWeight: 600 }}>
              {moneyFormatter({ amount: dueAmount })}
            </div>
          </Col>
        </Row>
        <Divider style={{ margin: '10px 0 14px' }} />

        <Table
          rowKey={(item) => item._id}
          dataSource={clientRepayments}
          columns={repaymentColumns}
          loading={repaymentLoading}
          pagination={{ pageSize: 6 }}
          size="small"
        />
        {activeClient?._id ? (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Button type="primary" onClick={() => navigate(`/repayment/client/${activeClient._id}`)}>
              {translate('View Full Dues')}
            </Button>
          </div>
        ) : null}
      </Modal>
    </ErpLayout>
  );
}
