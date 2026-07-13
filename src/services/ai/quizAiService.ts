/**
 * خدمة الذكاء الاصطناعي لتوليد وتحليل الاختبارات
 * تستخدم Groq API مع نموذج Llama 3.3 لتوليد اختبارات ذكية من محتوى الدورات
 */

import type { AIQuizRequest, AIQuizResponse, QuizQuestion, SuspiciousFlag, QuizAttempt } from '../../shared/types/quiz';
import type { RichContent } from '../../shared/types/media';
import { callAi } from './edgeAiService';


/**
 * استخراج النص الكامل من المحتوى الغني للدورة
 */
function extractTextFromRichContent(content: RichContent): string {
  let text = '';
  for (const block of content.blocks) {
    switch (block.type) {
      case 'heading':
        text += `\n## ${block.content}\n`;
        break;
      case 'text':
        text += `${block.content}\n`;
        break;
      case 'list':
        text += `${block.content}:\n${(block.items || []).map(item => `- ${item}`).join('\n')}\n`;
        break;
      case 'table':
        text += `${block.content}:\n`;
        if (block.tableData) {
          for (const row of block.tableData) {
            text += `| ${row.join(' | ')} |\n`;
          }
        }
        break;
    }
  }
  if (content.summary) text += `\nالملخص: ${content.summary}\n`;
  return text.trim();
}

// ── نماذج الأسئلة حسب المستوى ──
const QUESTION_TEMPLATES = {
  'مبتدئ': {
    focus: 'المفاهيم الأساسية والتعريفات والمبادئ الأولى',
    style: 'أسئلة تعريفية مباشرة مع خيارات واضحة',
    cognitiveLevel: 'تذكر وفهم',
  },
  'متوسط': {
    focus: 'التطبيق والتحليل للمفاهيم',
    style: 'أسئلة تطبيقية تحتاج لفهم أعمق',
    cognitiveLevel: 'تطبيق وتحليل',
  },
  'متقدم': {
    focus: 'تحليل وتركيب وتقييم سيناريوهات معقدة',
    style: 'أسئلة مركبة تتطلب ربط المفاهيم',
    cognitiveLevel: 'تحليل وتركيب وتقييم',
  },
  'خبير': {
    focus: 'تقييم نقدي وابتكار حلول وحالات متقدمة',
    style: 'أسئلة استراتيجية تتطلب خبرة عميقة',
    cognitiveLevel: 'تقييم وابتكار',
  },
};

/**
 * توليد اختبار كامل باستخدام الذكاء الاصطناعي
 */
export async function generateQuizWithAI(request: AIQuizRequest): Promise<AIQuizResponse> {
  const template = QUESTION_TEMPLATES[request.difficulty];
  const language = request.language === 'en' ? 'English' : 'Arabic';
  const prompt = `أنشئ اختباراً تدريبياً بصيغة JSON فقط.
مستوى الصعوبة: ${request.difficulty}
التركيز: ${template.focus}
النمط: ${template.style}
المستوى المعرفي: ${template.cognitiveLevel}
اللغة: ${language}
عدد الأسئلة: ${request.numberOfQuestions}
البنية المطلوبة: questions[] مع question, options[4], correctAnswer(0-3), explanation, difficulty, points, timeLimit؛ وsummary وestimatedTimeMinutes.
محتوى الدورة (${request.courseTitle}):
${request.courseContent.slice(0, 15000)}`;

  try {
    const response = await callAi({
      task: 'quiz_generation',
      preferredModel: 'llama-3.3-70b-versatile',
      prompt,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = JSON.parse(response.content);
    return {
      questions: result.questions,
      summary: result.summary || `اختبار ${request.difficulty} في ${request.courseTitle}`,
      estimatedTimeMinutes: result.estimatedTimeMinutes || request.numberOfQuestions,
    };
  } catch (error) {
    console.error('AI Quiz Generation Error:', error);
    throw new Error('فشل في توليد الاختبار بالذكاء الاصطناعي');
  }
}

/**
 * تحليل محتوى الدورة للحصول على ملخص ذكي
 */
export async function analyzeCourseContent(content: RichContent): Promise<{
  summary: string;
  keyTopics: string[];
  estimatedReadingTime: number;
  suggestedQuestions: number;
}> {
  const text = extractTextFromRichContent(content);
  if (!text) {
    return {
      summary: content.summary || '',
      keyTopics: [],
      estimatedReadingTime: content.readingTimeMinutes || 10,
      suggestedQuestions: 5,
    };
  }

  const prompt = `حلل محتوى الدورة التالي وأعد JSON فقط بالمفاتيح summary وkeyTopics وestimatedReadingTime وsuggestedQuestions:
${text.slice(0, 10000)}`;
  try {
    const response = await callAi({
      task: 'course_analysis',
      preferredModel: 'llama-3.3-70b-versatile',
      prompt,
      messages: [{ role: 'user', content: prompt }],
    });
    const analysis = JSON.parse(response.content);
    return {
      summary: analysis.summary || content.summary || '',
      keyTopics: analysis.keyTopics || [],
      estimatedReadingTime: analysis.estimatedReadingTime || content.readingTimeMinutes || 10,
      suggestedQuestions: analysis.suggestedQuestions || 5,
    };
  } catch {
    return {
      summary: content.summary || '',
      keyTopics: [],
      estimatedReadingTime: content.readingTimeMinutes || 10,
      suggestedQuestions: 5,
    };
  }
}

/**
 * كشف المحاولات المشبوهة في الاختبارات
 */
export function detectSuspiciousBehavior(attempts: QuizAttempt[]): SuspiciousFlag[] {
  const flags: SuspiciousFlag[] = [];
  const latestAttempt = attempts[attempts.length - 1];
  if (!latestAttempt) return flags;

  // 1. كشف السرعة غير الطبيعية (أقل من ثانيتين لكل سؤال)
  const avgTimePerQuestion = latestAttempt.timeSpent / latestAttempt.totalQuestions;
  if (avgTimePerQuestion < 2) {
    flags.push({
      type: 'too_fast',
      severity: 'high',
      description: `سرعة غير طبيعية: متوسط ${avgTimePerQuestion.toFixed(1)} ثانية لكل سؤال`,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. كشف البطء الشديد (أكثر من 5 دقائق لكل سؤال)
  if (avgTimePerQuestion > 300) {
    flags.push({
      type: 'too_slow',
      severity: 'medium',
      description: `بطء غير طبيعي: متوسط ${avgTimePerQuestion.toFixed(1)} ثانية لكل سؤال`,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. كشف نمط الإجابات المتطابقة
  if (attempts.length >= 2) {
    const previousAttempt = attempts[attempts.length - 2];
    if (previousAttempt) {
      const sameAnswers = latestAttempt.answers.filter((a, i) => {
        return previousAttempt.answers[i]?.selectedAnswer === a.selectedAnswer;
      }).length;
      
      if (sameAnswers === latestAttempt.totalQuestions) {
        flags.push({
          type: 'pattern_matching',
          severity: 'medium',
          description: 'جميع الإجابات متطابقة مع المحاولة السابقة',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // 4. كشف المحاولات المتعددة
  if (attempts.length >= 5) {
    flags.push({
      type: 'multiple_attempts',
      severity: 'low',
      description: `محاولات متعددة: ${attempts.length} محاولات`,
      timestamp: new Date().toISOString(),
    });
  }

  return flags;
}

/**
 * تحليل أداء الموظف في الاختبارات مع توصيات
 */
export function analyzePerformance(attempts: QuizAttempt[]): {
  averageScore: number;
  improvement: number;
  weakAreas: string[];
  recommendations: string[];
  suspiciousActivity: boolean;
} {
  if (attempts.length === 0) {
    return {
      averageScore: 0,
      improvement: 0,
      weakAreas: [],
      recommendations: ['لم يقم الموظف بأي محاولة اختبار بعد'],
      suspiciousActivity: false,
    };
  }

  const scores = attempts.map(a => a.score);
  const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const improvement = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : 0;
  const flags = attempts.flatMap(a => a.suspiciousFlags);
  const suspiciousActivity = flags.length > 0;

  // تحليل الأسئلة التي تمت الإجابة عليها بشكل خاطئ
  const wrongAnswers = attempts.flatMap(a => 
    a.answers.filter((ans, idx) => ans.selectedAnswer !== 0) // simplified analysis
  );

  const recommendations: string[] = [];
  if (averageScore < 60) {
    recommendations.push('يحتاج إلى مراجعة شاملة لمحتوى الدورة');
    recommendations.push('ينصح بإعادة الدورة التدريبية');
  } else if (averageScore < 75) {
    recommendations.push('يحتاج إلى تركيز على المواضيع التي أخطأ فيها');
    recommendations.push('مراجعة النقاط الجوهرية للدورة');
  } else {
    recommendations.push('أداء جيد، يمكن الانتقال إلى مستويات متقدمة');
  }

  if (suspiciousActivity) {
    recommendations.push('⚠️ يوجد نشاط مشبوه في الاختبارات، يرجى المراجعة');
  }

  if (improvement > 0) {
    recommendations.push(`تحسن ملحوظ: +${improvement}% عن المحاولة الأولى`);
  }

  return {
    averageScore,
    improvement,
    weakAreas: [],
    recommendations,
    suspiciousActivity,
  };
}