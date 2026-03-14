import {
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Row,
  Col,
  Button,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useCallback } from 'react';
import SelectAsync from '@/components/SelectAsync';
import useLanguage from '@/locale/useLanguage';
import { useDate } from '@/settings';

const STATUS_OPTIONS = [
  { label: 'Paid', value: 'paid' },
  { label: 'Default', value: 'default' },
  { label: 'Partial', value: 'partial' },
  { label: 'Not Started', value: 'not_started' },
];

const normalizeRepaymentStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'late payment') return 'late';
  if (s === 'not-started' || s === 'not started') return 'not_started';
  return s || 'not_started';
};

export default function RepaymentForm({ isUpdateForm = false }) {
  const translate = useLanguage();
  const { dateFormat } = useDate();
  const { TextArea } = Input;
  const form = Form.useFormInstance();

  /* ================= WATCH SAFE VALUES ================= */

  const amount = Form.useWatch('amount', form);
  const status = Form.useWatch('status', form);
  const originalStatus = Form.useWatch('_originalStatus', form);
  const additionalPayment = Form.useWatch('additionalPayment', form);
  const paymentDate = Form.useWatch('paymentDate', form);
  const dueDate = Form.useWatch('date', form);
  const client = Form.useWatch('client', form);

  /* ❌ DO NOT WATCH amountPaid — causes typing bug */

  const originalPaidAmount =
    Number(form.getFieldValue('_originalAmountPaid')) || 0;

  /* ================= SAFE NUMERIC VALUES ================= */

  const totalAmount = Number(amount) || 0;

  const paidAmount =
    Number(form.getFieldValue('amountPaid')) || 0;

  const addPayment = Number(additionalPayment) || 0;

  const normalizedStatus = normalizeRepaymentStatus(status);
  const normalizedOriginalStatus = normalizeRepaymentStatus(
    originalStatus || status
  );

  const isStatusReadonly =
  normalizedOriginalStatus === 'paid' ||
  normalizedOriginalStatus === 'late';

  /* ================= FIRST PARTIAL LOGIC ================= */

  const isFirstPartial =
    normalizedStatus === 'partial' &&
    originalPaidAmount <= 0;

  /* ================= BALANCE ================= */

  const balanceAmount = Math.max(
    0,
    totalAmount - (paidAmount + addPayment)
  );

  /* ================= STATUS OPTIONS ================= */

  const statusOptions = useMemo(() => {
    if (!isUpdateForm) return STATUS_OPTIONS;

    switch (normalizedOriginalStatus) {
      case 'not_started':
        return STATUS_OPTIONS.filter(o =>
          ['paid', 'partial', 'default'].includes(o.value)
        );

      case 'default':
        return STATUS_OPTIONS.filter(o =>
          ['paid', 'partial'].includes(o.value)
        );

      case 'partial':
        return STATUS_OPTIONS.filter(o =>
          ['paid'].includes(o.value)
        );

      case 'paid':
        return STATUS_OPTIONS.filter(o =>
          o.value === 'paid'
        );

        case 'late':
          return STATUS_OPTIONS.filter(o =>
            o.value === 'late'
          );

      default:
        return STATUS_OPTIONS;
    }
  }, [isUpdateForm, normalizedOriginalStatus]);

  /* ================= LOCK PAID STATUS ================= */

  useEffect(() => {
    if (isUpdateForm && normalizedOriginalStatus === 'paid') {
      form.setFieldValue('status', 'paid');
    }
  }, [form, isUpdateForm, normalizedOriginalStatus]);

  /* ================= AUTO SET FULL PAYMENT ================= */

  useEffect(() => {
    if (['paid', 'late'].includes(normalizedStatus) && totalAmount > 0) {
      form.setFieldValue('amountPaid', totalAmount);
    }
  }, [form, normalizedStatus, totalAmount]);

  /* ================= AUTO LATE DETECTION ================= */

  useEffect(() => {
    if (
      normalizedStatus === 'paid' &&
      paymentDate &&
      dueDate &&
      dayjs(paymentDate).isAfter(dueDate)
    ) {
      form.setFieldValue('status', 'late');
    }
  }, [form, normalizedStatus, paymentDate, dueDate]);

  /* ================= ENFORCE READONLY STATUS ================= */

  useEffect(() => {
    if (
      isStatusReadonly &&
      normalizedStatus !== normalizedOriginalStatus
    ) {
      form.setFieldValue('status', normalizedOriginalStatus);
    }
  }, [form, isStatusReadonly, normalizedStatus, normalizedOriginalStatus]);

  /* ================= INITIALIZE ORIGINAL PAID ================= */

  useEffect(() => {
    if (!isUpdateForm) return;

    const initialPaid = form.getFieldValue('amountPaid') ?? 0;
    form.setFieldValue('_originalAmountPaid', initialPaid);
  }, [isUpdateForm, client, dueDate]);

  /* ================= PARTIAL PAYMENT HANDLER ================= */

  const handlePartialPayment = useCallback(() => {
    const remainingBalance = totalAmount - paidAmount;
    const newPaid = paidAmount + addPayment;

    if (addPayment <= 0) {
      form.setFields([
        {
          name: 'additionalPayment',
          errors: ['Additional payment must be greater than 0'],
        },
      ]);
      return;
    }

    if (newPaid > totalAmount) {
      form.setFields([
        {
          name: 'additionalPayment',
          errors: [`Exceeds remaining balance: ${remainingBalance.toFixed(2)}`],
        },
      ]);
      return;
    }

    form.setFieldsValue({
      amountPaid: newPaid,
      additionalPayment: undefined,
    });
  }, [paidAmount, addPayment, totalAmount, form]);

  /* ================= UI ================= */

  return (
    <>
      {/* CLIENT */}
      <Form.Item
        label={translate('Client')}
        name="client"
        rules={[{ required: true }]}
      >
        <SelectAsync
          entity="client"
          displayLabels={['name']}
          placeholder={translate('select_client')}
          disabled={isUpdateForm}
        />
      </Form.Item>

      {/* DATE */}
      <Form.Item
        label={translate('Date')}
        name="date"
        rules={[{ required: true }]}
        initialValue={dayjs()}
        getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
      >
        <DatePicker style={{ width: '100%' }} format={dateFormat} />
      </Form.Item>

      {/* AMOUNTS */}
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item
            label={translate('Total Amount')}
            name="amount"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>

        <Col span={8}>
          <Form.Item label={translate('Principal')} name="principal">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>

        <Col span={8}>
          <Form.Item label={translate('Interest')} name="interest">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      {/* STATUS */}
      <Form.Item
        label={translate('Status')}
        name="status"
        rules={[{ required: true }]}
        initialValue="not_started"
      >
        <Select options={statusOptions} disabled={isStatusReadonly} />
      </Form.Item>

      {/* ================= PARTIAL PAYMENT ================= */}
      {normalizedStatus === 'partial' && (
        <>
          {/* FIRST PAYMENT */}
          {isFirstPartial ? (
            <Form.Item
              label={translate('Amount Paid')}
              name="amountPaid"
              rules={[{ required: true, message: 'Enter payment amount' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Enter first payment"
                precision={2}
                controls={false}
              />
            </Form.Item>
          ) : (
            <Row gutter={12} align="middle">
              <Col span={8}>
                <Form.Item label={translate('Amount Paid')} name="amountPaid">
                  <InputNumber disabled precision={2} style={{ width: '100%' }} />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item
                  label={translate('Additional Payment')}
                  name="additionalPayment"
                >
                  <InputNumber
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    placeholder="Enter additional amount"
                  />
                </Form.Item>
              </Col>

              <Col span={8} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Button
                  type="primary"
                  onClick={handlePartialPayment}
                  disabled={!additionalPayment || addPayment <= 0}
                  style={{ minWidth: 80 }}
                >
                  {translate('Pay')}
                </Button>
              </Col>
            </Row>
          )}

          {/* BALANCE */}
          <Form.Item label={translate('Balance')}>
            <InputNumber
              value={balanceAmount}
              readOnly
              disabled
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </>
      )}

      {/* PAID */}
      {normalizedStatus === 'paid' && (
        <Form.Item
          label={translate('Payment Date')}
          name="paymentDate"
          rules={[{ required: true }]}
          getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
        >
          <DatePicker style={{ width: '100%' }} format={dateFormat} />
        </Form.Item>
      )}

      {/* NOTES */}
      <Form.Item label={translate('Notes')} name="notes">
        <TextArea />
      </Form.Item>
    </>
  );
}