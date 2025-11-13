import { HighlightColors } from '../api'
import { DEFAULT_TEMPLATE } from './template'
import { getEndpointUrl } from './local-test'

export const FRONT_MATTER_VARIABLES = [
  'title',
  'author',
  'tags',
  'date_saved',
  'date_published',
  'omnivore_url',
  'site_name',
  'original_url',
  'description',
  'note',
  'type',
  'date_read',
  'words_count',
  'read_length',
  'state',
  'date_archived',
  'image',
]

export enum Filter {
  ALL = '同步所有文章',
}

export enum HighlightOrder {
  LOCATION = 'the location of highlights in the article',
  TIME = 'the time that highlights are updated',
}

export enum HighlightManagerId {
  HIGHLIGHTR = 'hltr',
  OMNIVORE = 'omni',
}

export enum ImageMode {
  LOCAL = 'local',       // 缓存到本地
  REMOTE = 'remote',     // 保留原始链接
  DISABLED = 'disabled'  // 不加载图片（注释掉）
}

export enum MergeMode {
  NONE = 'none',           // 不合并（每篇文章独立文件）
  MESSAGES = 'messages',   // 仅合并企微消息
  ALL = 'all'              // 合并所有文章
}

export type HighlightColorMapping = { [key in HighlightColors]: string }

export const DEFAULT_SETTINGS: OmnivoreSettings = {
  dateHighlightedFormat: 'yyyy-MM-dd HH:mm:ss',
  dateSavedFormat: 'yyyy-MM-dd HH:mm:ss',
  apiKey: '',
  filter: 'ALL',
  syncAt: '',
  customQuery: '',
  template: DEFAULT_TEMPLATE,
  highlightOrder: 'LOCATION',
  syncing: false,
  folder: '笔记同步助手/{{{date}}}',
  folderDateFormat: 'yyyy-MM-dd',
  endpoint: getEndpointUrl('https://obsidian.notebooksyncer.com/api/graphql'),
  filename: '{{{title}}}',
  filenameDateFormat: 'yyyy-MM-dd',
  attachmentFolder: '笔记同步助手/attachments',
  version: '0.0.0',
  mergeMode: MergeMode.MESSAGES,  // 默认仅合并企微消息
  frequency: 0,
  intervalId: 0,
  frontMatterVariables: [],
  frontMatterTemplate: '',
  syncOnStart: false,
  enableHighlightColorRender: false,
  highlightManagerId: HighlightManagerId.OMNIVORE,
  highlightColorMapping: {
    [HighlightColors.Yellow]: '#fff3a3',
    [HighlightColors.Red]: '#ff5582',
    [HighlightColors.Blue]: '#adccff',
    [HighlightColors.Green]: '#bbfabb',
  },
  singleFileName: '同步助手_{{{date}}}',  // 新增: 单文件模式的文件名模板
  singleFileDateFormat: 'yyyy-MM-dd',  // 新增: 单文件模式的日期格式
  sectionSeparator: '%%{{{dateSaved}}}_start%%',  // 新增: 单文件模式中消息分隔符起始标记(空字符串表示不分隔)
  sectionSeparatorEnd: '%%{{{dateSaved}}}_end%%',  // 新增: 单文件模式中消息分隔符结束标记
  wechatMessageTemplate: '---\n## 📅 {{{dateSaved}}}\n{{{content}}}',  // 新增: 企微消息简洁模板
  // 图片处理设置
  imageMode: ImageMode.LOCAL,  // 图片处理模式（默认缓存到本地）
  enablePngToJpeg: false,  // PNG转JPEG（默认关闭）
  jpegQuality: 85,  // JPEG质量（0-100，默认85）
  imageDownloadRetries: 3,  // 图片下载重试次数（默认3）
  imageAttachmentFolder: '笔记同步助手/images/{{{date}}}',  // 图片存储文件夹
}

export interface OmnivoreSettings {
  apiKey: string
  filter: string
  syncAt: string
  customQuery: string
  highlightOrder: string
  template: string
  syncing: boolean
  folder: string
  folderDateFormat: string
  endpoint: string
  dateHighlightedFormat: string
  dateSavedFormat: string
  filename: string
  attachmentFolder: string
  version: string
  mergeMode: MergeMode
  frequency: number
  intervalId: number
  frontMatterVariables: string[]
  frontMatterTemplate: string
  filenameDateFormat: string
  syncOnStart: boolean
  enableHighlightColorRender: boolean
  highlightManagerId: HighlightManagerId
  highlightColorMapping: HighlightColorMapping
  singleFileName: string  // 新增: 单文件模式的文件名模板
  singleFileDateFormat: string  // 新增: 单文件模式的日期格式
  sectionSeparator: string  // 新增: 单文件模式中消息分隔符起始标记(空字符串表示不分隔)
  sectionSeparatorEnd: string  // 新增: 单文件模式中消息分隔符结束标记
  wechatMessageTemplate: string  // 新增: 企微消息简洁模板
  // 图片处理设置
  imageMode: ImageMode  // 图片处理模式
  enablePngToJpeg: boolean  // PNG转JPEG
  jpegQuality: number  // JPEG质量（0-100）
  imageDownloadRetries: number  // 图片下载重试次数
  imageAttachmentFolder: string  // 图片存储文件夹
}
