export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fail = (status, code, message, details) => {
  throw new HttpError(status, code, message, details);
};

export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;
  if (error?.name === 'MulterError') {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: { code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooLarge ? 'Файл превышает допустимый размер.' : 'Не удалось загрузить файл.' }
    });
  }
  if (error?.name === 'ZodError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Проверьте введённые данные.', details: error.issues?.map(({ path, message }) => ({ field: path.join('.'), message })) } });
  }
  if (error?.code === 'P2002') {
    return res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'Такая запись уже существует.' } });
  }
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера.' : (error?.message || 'Внутренняя ошибка сервера.');
  if (status >= 500) console.error('[nexus:error]', error);
  return res.status(status).json({ error: { code: error?.code || 'INTERNAL_ERROR', message, ...(error?.details ? { details: error.details } : {}) } });
}
