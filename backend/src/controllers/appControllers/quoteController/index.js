const quoteService = require('@/services/mysql/quoteService');

const methods = {};

methods.create = async (req, res) => {
  try {
    const result = await quoteService.createQuote({ body: req.body, admin: req.admin });
    return res.status(200).json({ success: true, result, message: 'Quote created successfully' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.update = async (req, res) => {
  try {
    const result = await quoteService.updateQuote({ id: req.params.id, body: req.body, admin: req.admin });
    return res.status(200).json({ success: true, result, message: 'we update this document ' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.read = async (req, res) => {
  try {
    const result = await quoteService.readQuote({ id: req.params.id, admin: req.admin });
    if (!result) {
      return res.status(404).json({ success: false, result: null, message: 'No document found ' });
    }
    return res.status(200).json({ success: true, result, message: 'we found this document ' });
  } catch (error) {
    return res.status(500).json({ success: false, result: null, message: error.message });
  }
};

methods.list = async (req, res) => {
  try {
    const { result, count, page, limit } = await quoteService.listQuotes({ query: req.query, admin: req.admin });
    const pagination = { page, pages: Math.ceil(count / limit), count };
    return res.status(count > 0 ? 200 : 203).json({
      success: true,
      result: count > 0 ? result : [],
      pagination,
      message: count > 0 ? 'Successfully found all documents' : 'Collection is Empty',
    });
  } catch (error) {
    return res.status(500).json({ success: false, result: null, message: error.message });
  }
};

methods.summary = async (req, res) => {
  try {
    const result = await quoteService.summarizeQuotes({ type: req.query.type, admin: req.admin });
    return res.status(200).json({
      success: true,
      result,
      message: `Successfully found all Quotations for the last ${req.query.type || 'month'}`,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};

methods.convert = async (_req, res) =>
  res.status(200).json({
    success: true,
    result: null,
    message: 'Please Upgrade to Premium  Version to have full features',
  });

methods.mail = async (_req, res) =>
  res.status(501).json({ success: false, result: null, message: 'Mail is not yet migrated to MySQL' });
methods.delete = async (req, res) => {
  try {
    const result = await quoteService.deleteQuote({ id: req.params.id, admin: req.admin });
    if (!result) {
      return res.status(404).json({ success: false, result: null, message: 'No document found ' });
    }
    return res.status(200).json({ success: true, result, message: 'Successfully Deleted the document ' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, result: null, message: error.message });
  }
};
methods.search = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.listAll = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });
methods.filter = async (_req, res) =>
  res.status(501).json({ success: false, result: [], message: 'Not implemented for MySQL migration' });

module.exports = methods;
