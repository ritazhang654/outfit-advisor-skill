import { S3Storage } from 'coze-coding-dev-sdk';

// S3 兼容对象存储单例
export const storage = new S3Storage({ region: 'cn-beijing' });

// 生成签名访问 URL；持久化数据只存 key，展示时动态生成
export async function signedUrl(key: string, expireTime = 86400): Promise<string> {
  return storage.generatePresignedUrl({ key, expireTime });
}
