import { useParams } from 'react-router-dom';
import { Tag, Row, Col, Card, Statistic, Table, Divider } from 'antd';
import { PageHeader } from '@ant-design/pro-layout';
import dayjs from 'dayjs';
import { tagColor } from '@/utils/statusTagColor';
import { useMoney, useDate } from '@/settings';
import useLanguage from '@/locale/useLanguage';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { crud } from '@/redux/crud/actions';
import { selectListItems, selectReadItem } from '@/redux/crud/selectors';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ErpLayout } from '@/layout';
import { Dropdown, Menu, Modal, Form, Input, Select, InputNumber, Button, DatePicker } from 'antd';
import RepaymentForm from '@/forms/RepaymentForm';
import { request } from '@/request';

export default function ClientRepayment() {
    const { id } = useParams();
    const translate = useLanguage();
    const { dateFormat } = useDate();
    const { moneyFormatter } = useMoney();
    const dispatch = useDispatch();

    const { result: client, isLoading: isClientLoading } = useSelector(selectReadItem);
    const { result: repaymentsResult, isLoading: isRepaymentsLoading } = useSelector(selectListItems);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentRepayment, setCurrentRepayment] = useState(null);
    const [form] = Form.useForm();
    const [localRepayments, setLocalRepayments] = useState([]);

    useEffect(() => {
        if (repaymentsResult?.items) {
            setLocalRepayments(repaymentsResult.items);
        }
    }, [repaymentsResult]);

    useEffect(() => {
        dispatch(crud.read({ entity: 'client', id }));
        fetchRepayments();
    }, [id]);

    const fetchRepayments = () => {
        dispatch(crud.list({ entity: 'repayment', options: { filter: 'client', equal: id, items: 100 } }));
    };

    const handleEdit = (record) => {
        setCurrentRepayment(record);
        form.setFieldsValue({
            ...record,
            date: dayjs(record.date),
        });
        setIsModalOpen(true);
    };

    const handleDelete = (record) => {
        Modal.confirm({
            title: translate('Are you sure you want to delete this repayment?'),
            onOk: () => {
                dispatch(crud.delete({ entity: 'repayment', id: record._id }));
                setTimeout(fetchRepayments, 500);
            },
        });
    };

    const handleModalOk = () => {
        form.validateFields().then((values) => {
            const updatedItems = localRepayments.map((item) =>
                item._id === currentRepayment._id ? { ...item, ...values } : item
            );
            setLocalRepayments(updatedItems);

            dispatch(crud.update({ entity: 'repayment', id: currentRepayment._id, jsonData: values }));
            setIsModalOpen(false);
            setTimeout(fetchRepayments, 500);
        });
    };

const handleStatusChange = async (record, newStatus) => {
        // Use the new status directly (no legacy mapping needed)
        const paymentStatus = newStatus;

        const updatedItems = localRepayments.map((item) =>
            item._id === record._id ? { ...item, status: newStatus, paymentStatus } : item
        );
        setLocalRepayments(updatedItems);
        
        // Update in database and wait for response
        await dispatch(crud.update({ entity: 'repayment', id: record._id, jsonData: { status: newStatus, paymentStatus } }));
        
        // Dispatch custom event to refresh the calendar view
        window.dispatchEvent(new Event('repayment-updated'));
        
        // Refresh current client repayments
        setTimeout(fetchRepayments, 500);
    };

    const dataTableColumns = [
        {
            title: translate('Date'),
            dataIndex: 'date',
            render: (date) => dayjs(date).format(dateFormat),
        },
        {
            title: translate('Principal'),
            dataIndex: 'principal',
            render: (principal) => moneyFormatter({ amount: principal }),
        },
        {
            title: translate('Interest'),
            dataIndex: 'interest',
            render: (interest) => moneyFormatter({ amount: interest }),
        },
        {
            title: translate('Total'),
            dataIndex: 'amount',
            render: (amount) => moneyFormatter({ amount }),
        },
        {
            title: translate('Status'),
            dataIndex: 'status',
            render: (status, record) => {
                let color = tagColor(status)?.color;
                return (
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'paid', label: translate('paid') },
                                { key: 'late', label: translate('late') },
                                { key: 'partial', label: translate('partial') },
                                { key: 'default', label: translate('default') },
                                { key: 'not_started', label: translate('not_started') },
                            ],
                            onClick: ({ key }) => handleStatusChange(record, key),
                        }}
                        trigger={['click']}
                    >
                        <Tag color={color} style={{ cursor: 'pointer' }}>
                            {translate(status)}
                        </Tag>
                    </Dropdown>
                );
            },
        },
        {
            title: '',
            key: 'action',
            render: (_, record) => (
                <div style={{ display: 'flex', gap: '10px' }}>
                    <EditOutlined onClick={() => handleEdit(record)} style={{ cursor: 'pointer', color: '#1890ff' }} />
                    <DeleteOutlined onClick={() => handleDelete(record)} style={{ cursor: 'pointer', color: '#ff4d4f' }} />
                </div>
            ),
        },
    ];

    return (
        <ErpLayout>
            <PageHeader
                onBack={() => window.history.back()}
                backIcon={<ArrowLeftOutlined />}
                title={translate('Client Repayments')}
                ghost={false}
            />
            <Row gutter={[24, 24]}>
                <Col span={24}>
                    <Card loading={isClientLoading}>
                        <Row gutter={[16, 16]}>
                            <Col xs={12} md={6}>
                                <div className="loan-info-item">
                                    <small style={{ color: '#8c8c8c', fontSize: '12px', display: 'block' }}>{translate('Client')}</small>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '16px', wordBreak: 'break-word' }}>{client?.name}</h3>
                                </div>
                            </Col>
                            <Col xs={12} md={6}>
                                <div className="loan-info-item">
                                    <small style={{ color: '#8c8c8c', fontSize: '12px', display: 'block' }}>{translate('Loan Amount')}</small>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '16px' }}>{moneyFormatter({ amount: client?.loanAmount })}</h3>
                                </div>
                            </Col>
                            <Col xs={12} md={6}>
                                <div className="loan-info-item">
                                    <small style={{ color: '#8c8c8c', fontSize: '12px', display: 'block' }}>{translate('Interest Rate')}</small>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '16px' }}>{client?.interestRate}%</h3>
                                </div>
                            </Col>
                            <Col xs={12} md={6}>
                                <div className="loan-info-item">
                                    <small style={{ color: '#8c8c8c', fontSize: '12px', display: 'block' }}>{translate('Term')}</small>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '16px' }}>{client?.term}</h3>
                                </div>
                            </Col>
                        </Row>
                    </Card>
                </Col>
                <Col span={24}>
                    <Table
                        columns={dataTableColumns}
                        rowKey={(item) => item._id}
                        dataSource={localRepayments}
                        loading={isRepaymentsLoading && localRepayments.length === 0}
                        pagination={false}
                    />
                </Col>
            </Row>

            <Modal
                title={translate('Edit Repayment')}
                open={isModalOpen}
                onOk={handleModalOk}
                onCancel={() => setIsModalOpen(false)}
            >
                <Form form={form} layout="vertical">
                    <RepaymentForm isUpdateForm={true} />
                </Form>
            </Modal>
        </ErpLayout>
    );
}
