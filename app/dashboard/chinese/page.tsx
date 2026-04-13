'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── 타입 ────────────────────────────────────────────────────────────────────
type Level = 'beginner' | 'intermediate' | 'advanced';
type Tab = 'vocab' | 'grammar' | 'conversation' | 'video' | 'ai';
type QuizMode = 'flash' | 'choice' | 'input' | null;

interface VocabWord {
  id: string;
  word: string;
  translation: string;
  pronunciation?: string;
  example?: string;
  level: number;
  next_review: string;
}

interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── 내장 학습 콘텐츠 ─────────────────────────────────────────────────────────
const GRAMMAR_DATA: Record<Level, Array<{ title: string; pattern: string; structure: string; examples: Array<{ zh: string; pinyin: string; kr: string }>; notes?: string }>> = {
  beginner: [
    {
      title: '기본 인사 & 자기소개',
      pattern: '你好！我是___。',
      structure: '你好 (안녕) + 我是 (나는 ~이다) + [이름/직책]',
      examples: [
        { zh: '你好！我是金部长。', pinyin: 'Nǐ hǎo! Wǒ shì Jīn bùzhǎng.', kr: '안녕하세요! 저는 김 부장입니다.' },
        { zh: '很高兴认识你。', pinyin: 'Hěn gāoxìng rènshi nǐ.', kr: '만나서 반갑습니다.' },
        { zh: '请多关照。', pinyin: 'Qǐng duō guānzhào.', kr: '잘 부탁드립니다.' },
      ],
    },
    {
      title: '숫자 & 가격',
      pattern: '这个多少钱？',
      structure: '这个 (이것) + 多少 (얼마) + 钱 (돈)?',
      examples: [
        { zh: '这个产品多少钱一个？', pinyin: 'Zhège chǎnpǐn duōshao qián yīgè?', kr: '이 제품 하나에 얼마입니까?' },
        { zh: '一千块。', pinyin: 'Yīqiān kuài.', kr: '1,000위안입니다.' },
        { zh: '能便宜一点吗？', pinyin: 'Néng piányí yīdiǎn ma?', kr: '조금 더 저렴하게 해주실 수 있나요?' },
      ],
    },
    {
      title: '존재 & 위치 표현',
      pattern: '___在哪里？',
      structure: '[사물/사람] + 在 (~에 있다) + 哪里 (어디)?',
      examples: [
        { zh: '工厂在哪里？', pinyin: 'Gōngchǎng zài nǎlǐ?', kr: '공장은 어디에 있습니까?' },
        { zh: '仓库在二楼。', pinyin: 'Cāngkù zài èr lóu.', kr: '창고는 2층에 있습니다.' },
        { zh: '洗手间在右边。', pinyin: 'Xǐshǒujiān zài yòubian.', kr: '화장실은 오른쪽에 있습니다.' },
      ],
    },
    {
      title: '시간 표현',
      pattern: '什么时候___？',
      structure: '什么时候 (언제) + [동사구]?',
      examples: [
        { zh: '什么时候发货？', pinyin: 'Shénme shíhòu fāhuò?', kr: '언제 발송됩니까?' },
        { zh: '下周一发货。', pinyin: 'Xià zhōuyī fāhuò.', kr: '다음 주 월요일에 발송합니다.' },
        { zh: '几点开会？', pinyin: 'Jǐ diǎn kāihuì?', kr: '몇 시에 회의합니까?' },
      ],
    },
    {
      title: '요청 표현',
      pattern: '请___。/ 麻烦你___。',
      structure: '请 (부탁합니다) / 麻烦你 (수고스럽지만) + [동사]',
      examples: [
        { zh: '请发一下报价单。', pinyin: 'Qǐng fā yīxià bàojiàdān.', kr: '견적서를 보내주세요.' },
        { zh: '麻烦你确认一下。', pinyin: 'Máfan nǐ quèrèn yīxià.', kr: '수고스럽지만 확인 부탁드립니다.' },
        { zh: '请等一下。', pinyin: 'Qǐng děng yīxià.', kr: '잠깐만 기다려 주세요.' },
      ],
    },
  ],
  intermediate: [
    {
      title: '비즈니스 가격 협상',
      pattern: '我们的价格是___，能否考虑___？',
      structure: '我们的价格是 (저희 가격은) + [가격] + 能否考虑 (~을 고려해주실 수 있나요?) + [제안]',
      examples: [
        { zh: '我们的价格是最优惠的了。', pinyin: 'Wǒmen de jiàgé shì zuì yōuhuì de le.', kr: '저희 가격이 가장 우대된 가격입니다.' },
        { zh: '如果订单量大，价格可以再谈。', pinyin: 'Rúguǒ dìngdān liàng dà, jiàgé kěyǐ zài tán.', kr: '주문량이 크다면 가격은 다시 협의 가능합니다.' },
        { zh: '能否给我们一个更好的价格？', pinyin: 'Néng fǒu gěi wǒmen yīgè gèng hǎo de jiàgé?', kr: '더 좋은 가격을 제시해주실 수 있나요?' },
      ],
      notes: '협상 시 직접적 거절보다 "再考虑考虑(다시 생각해보겠습니다)"로 여지를 남기는 것이 좋습니다.',
    },
    {
      title: '납기 & 배송 협의',
      pattern: '交货期是___，___能否提前？',
      structure: '交货期 (납기일) + 是 (은/는) + [날짜] + 能否提前 (앞당길 수 있나요)?',
      examples: [
        { zh: '交货期是三十天。', pinyin: 'Jiāohuòqī shì sānshí tiān.', kr: '납기일은 30일입니다.' },
        { zh: '能否提前到二十天？', pinyin: 'Néng fǒu tíqián dào èrshí tiān?', kr: '20일로 앞당길 수 있나요?' },
        { zh: '我们会尽力安排的。', pinyin: 'Wǒmen huì jìnlì ānpái de.', kr: '최대한 조율해보겠습니다.' },
      ],
    },
    {
      title: '품질 요구사항',
      pattern: '质量方面，我们要求___。',
      structure: '质量方面 (품질 면에서) + 我们要求 (저희는 요구합니다) + [기준]',
      examples: [
        { zh: '产品质量必须符合KC认证标准。', pinyin: 'Chǎnpǐn zhìliàng bìxū fúhé KC rènzhèng biāozhǔn.', kr: '제품 품질은 반드시 KC 인증 기준에 부합해야 합니다.' },
        { zh: '不良率不能超过百分之一。', pinyin: 'Bùliánglǜ bù néng chāoguò bǎifēnzhī yī.', kr: '불량률은 1%를 초과해서는 안 됩니다.' },
        { zh: '请提供第三方检测报告。', pinyin: 'Qǐng tígōng dìsānfāng jiǎncè bàogào.', kr: '제3자 검사 보고서를 제출해주세요.' },
      ],
    },
    {
      title: '결제 조건',
      pattern: '付款方式是___。',
      structure: '付款方式 (결제 방식) + 是 + [T/T, L/C 등]',
      examples: [
        { zh: '付款方式是T/T，三十天内付清。', pinyin: 'Fùkuǎn fāngshì shì T/T, sānshí tiān nèi fùqīng.', kr: '결제 방식은 T/T이며, 30일 내 완납입니다.' },
        { zh: '首批订单需要预付三十%。', pinyin: 'Shǒu pī dìngdān xūyào yùfù sānshí%.', kr: '첫 번째 주문은 30% 선불이 필요합니다.' },
        { zh: '能否接受信用证？', pinyin: 'Néng fǒu jiēshòu xìnyòngzhèng?', kr: 'L/C를 받으실 수 있나요?' },
      ],
    },
    {
      title: '샘플 요청 & 수정',
      pattern: '样品___，能否___？',
      structure: '样品 (샘플) + [상태/문제] + 能否 (가능한가요?) + [요청사항]',
      examples: [
        { zh: '样品已收到，整体效果不错。', pinyin: 'Yàngpǐn yǐ shōudào, zhěngtǐ xiàoguǒ búcuò.', kr: '샘플 수령했습니다. 전체적으로 괜찮습니다.' },
        { zh: '颜色能否调整为暖白色？', pinyin: 'Yánsè néng fǒu tiáozhěng wéi nuǎn báisè?', kr: '색상을 웜화이트로 조정 가능한가요?' },
        { zh: '请尽快发出修改后的样品。', pinyin: 'Qǐng jǐnkuài fāchū xiūgǎi hòu de yàngpǐn.', kr: '수정된 샘플을 빨리 보내주세요.' },
      ],
    },
    {
      title: '연락 & 후속 조치',
      pattern: '请尽快回复。/ 等您的消息。',
      structure: '请尽快 (빠른 시일 내에) + [동사] / 等您的消息 (연락 기다리겠습니다)',
      examples: [
        { zh: '请尽快确认并回复。', pinyin: 'Qǐng jǐnkuài quèrèn bìng huífù.', kr: '빠른 확인 및 회신 부탁드립니다.' },
        { zh: '期待您的早日回复。', pinyin: 'Qīdài nín de zǎorì huífù.', kr: '조속한 답변 기다리겠습니다.' },
        { zh: '有任何问题请随时联系我。', pinyin: 'Yǒu rènhé wèntí qǐng suíshí liánxì wǒ.', kr: '어떤 문제든 언제든지 연락주세요.' },
      ],
    },
  ],
  advanced: [
    {
      title: '계약 & 조건 협의',
      pattern: '合同条款中，关于___的规定需要进一步明确。',
      structure: '合同条款 (계약 조항) + 关于~的规定 (~에 관한 규정) + 需要进一步明确 (명확히 할 필요가 있다)',
      examples: [
        { zh: '关于违约责任的条款需要进一步协商。', pinyin: 'Guānyú wéiyuē zérèn de tiáokuǎn xūyào jìnyībù xiéshāng.', kr: '위약 책임 조항은 추가 협상이 필요합니다.' },
        { zh: '双方对合同内容达成一致后再签署。', pinyin: 'Shuāngfāng duì hétong nèiróng dáchéng yīzhì hòu zài qiānshǔ.', kr: '양측이 계약 내용에 합의한 후 서명하겠습니다.' },
        { zh: '不可抗力条款需要明确定义范围。', pinyin: 'Bùkě kànglì tiáokuǎn xūyào míngquè dìngyì fànwéi.', kr: '불가항력 조항의 범위를 명확히 정의해야 합니다.' },
      ],
    },
    {
      title: '분쟁 & 문제 해결',
      pattern: '对于此次___问题，我方认为___，希望___。',
      structure: '对于此次 (이번) + [문제] + 我方认为 (저희 측은 ~라고 봅니다) + 希望 (바라건대)',
      examples: [
        { zh: '对于此次质量问题，我方认为责任在贵方，希望给予相应赔偿。', pinyin: 'Duìyú cǐcì zhìliàng wèntí, wǒfāng rènwéi zérèn zài guìfāng, xīwàng jǐyǔ xiāngyìng péicháng.', kr: '이번 품질 문제에 대해 당사는 귀사 측에 책임이 있다고 보며 상응하는 배상을 원합니다.' },
        { zh: '建议通过友好协商解决此次纠纷。', pinyin: 'Jiànyì tōngguò yǒuhǎo xiéshāng jiějué cǐcì jiūfēn.', kr: '이번 분쟁을 우호적 협상으로 해결하길 제안합니다.' },
        { zh: '如协商不成，将依据合同约定提请仲裁。', pinyin: 'Rú xiéshāng bùchéng, jiāng yījù hétong yuēdìng tíqǐng zhòngcái.', kr: '협상 불성립 시 계약서에 따라 중재를 신청하겠습니다.' },
      ],
    },
    {
      title: '파트너십 & 장기 협력',
      pattern: '我们希望与贵公司建立长期稳定的合作关系。',
      structure: '希望与~建立 (~와 ~을 구축하기를 원한다) + 长期稳定的合作关系 (장기적이고 안정적인 협력 관계)',
      examples: [
        { zh: '我们希望能成为贵方在韩国的独家代理商。', pinyin: 'Wǒmen xīwàng néng chéngwéi guìfāng zài Hánguó de dújiā dàilǐshāng.', kr: '귀사의 한국 독점 대리점이 되기를 희망합니다.' },
        { zh: '双方合作已有五年，期待进一步深化合作。', pinyin: 'Shuāngfāng hézuò yǐ yǒu wǔ nián, qīdài jìnyībù shēnhuà hézuò.', kr: '양사의 협력이 5년이 되었으며, 협력을 더욱 심화하길 기대합니다.' },
        { zh: '建议签订战略合作框架协议。', pinyin: 'Jiànyì qiāndìng zhànlüè hézuò kuàngjià xiéyì.', kr: '전략적 협력 프레임워크 협약 체결을 제안합니다.' },
      ],
    },
    {
      title: '인증 & 규정 준수',
      pattern: '该产品已获得___认证，符合___标准。',
      structure: '该产品 (해당 제품) + 已获得 (이미 취득) + [인증명] + 符合 (~에 부합) + [기준]',
      examples: [
        { zh: '该产品已通过CE和RoHS认证。', pinyin: 'Gāi chǎnpǐn yǐ tōngguò CE hé RoHS rènzhèng.', kr: '해당 제품은 CE 및 RoHS 인증을 통과했습니다.' },
        { zh: '出口韩国需要获得KC认证，我们可以协助办理。', pinyin: 'Chūkǒu Hánguó xūyào huòdé KC rènzhèng, wǒmen kěyǐ xiézhù bànlǐ.', kr: '한국 수출 시 KC 인증이 필요하며, 저희가 처리를 도와드릴 수 있습니다.' },
        { zh: '请提供完整的合规文件包。', pinyin: 'Qǐng tígōng wánzhěng de héguī wénjiàn bāo.', kr: '완전한 규정 준수 서류 패키지를 제출해주세요.' },
      ],
    },
  ],
};

const CONVERSATION_DATA: Record<Level, Array<{ title: string; icon: string; lines: Array<{ speaker: string; zh: string; pinyin: string; kr: string }> }>> = {
  beginner: [
    {
      title: '전시회 부스 방문',
      icon: '🏪',
      lines: [
        { speaker: '나', zh: '你好，我是韩国的LED贸易商。', pinyin: 'Nǐ hǎo, wǒ shì Hánguó de LED màoyìshāng.', kr: '안녕하세요, 저는 한국의 LED 무역상입니다.' },
        { speaker: '상대', zh: '欢迎！请进，请坐。', pinyin: 'Huānyíng! Qǐng jìn, qǐng zuò.', kr: '어서오세요! 들어오세요, 앉으세요.' },
        { speaker: '나', zh: '这个产品有什么特点？', pinyin: 'Zhège chǎnpǐn yǒu shénme tèdiǎn?', kr: '이 제품의 특징이 무엇인가요?' },
        { speaker: '상대', zh: '这款产品效率高，寿命长，已经通过CE认证。', pinyin: 'Zhè kuǎn chǎnpǐn xiàolǜ gāo, shòumìng cháng, yǐjīng tōngguò CE rènzhèng.', kr: '이 제품은 효율이 높고 수명이 길며, CE 인증을 통과했습니다.' },
        { speaker: '나', zh: '能给我一份产品目录吗？', pinyin: 'Néng gěi wǒ yī fèn chǎnpǐn mùlù ma?', kr: '제품 카탈로그 한 부 주실 수 있나요?' },
        { speaker: '상대', zh: '当然可以！这是我们的名片。', pinyin: 'Dāngrán kěyǐ! Zhè shì wǒmen de míngpiàn.', kr: '물론이죠! 이것이 저희 명함입니다.' },
      ],
    },
    {
      title: '샘플 요청',
      icon: '📦',
      lines: [
        { speaker: '나', zh: '我们想要一些样品。', pinyin: 'Wǒmen xiǎng yào yīxiē yàngpǐn.', kr: '샘플을 몇 개 받고 싶습니다.' },
        { speaker: '상대', zh: '需要几个？', pinyin: 'Xūyào jǐ gè?', kr: '몇 개 필요하신가요?' },
        { speaker: '나', zh: '五个就够了。运费怎么算？', pinyin: 'Wǔ gè jiù gòu le. Yùnfèi zěnme suàn?', kr: '5개면 충분합니다. 운송비는 어떻게 계산하나요?' },
        { speaker: '상대', zh: '样品免费，运费到付。', pinyin: 'Yàngpǐn miǎnfèi, yùnfèi dàofù.', kr: '샘플은 무료이고, 운송비는 착불입니다.' },
        { speaker: '나', zh: '好的，请发到我的地址。', pinyin: 'Hǎo de, qǐng fā dào wǒ de dìzhǐ.', kr: '좋습니다. 제 주소로 보내주세요.' },
      ],
    },
  ],
  intermediate: [
    {
      title: '가격 협상',
      icon: '💰',
      lines: [
        { speaker: '나', zh: '你们的FOB价格是多少？', pinyin: 'Nǐmen de FOB jiàgé shì duōshao?', kr: '귀사의 FOB 가격은 얼마입니까?' },
        { speaker: '상대', zh: '我们的FOB价格是每个十五美金，一千个起订。', pinyin: 'Wǒmen de FOB jiàgé shì měi gè shíwǔ měijīn, yīqiān gè qǐdìng.', kr: '저희 FOB 가격은 개당 15달러이며, 최소 주문량은 1,000개입니다.' },
        { speaker: '나', zh: '如果我们订五千个，价格能否优惠到十二美金？', pinyin: 'Rúguǒ wǒmen dìng wǔqiān gè, jiàgé néng fǒu yōuhuì dào shí\'èr měijīn?', kr: '5,000개를 주문한다면 가격을 12달러로 우대해주실 수 있나요?' },
        { speaker: '상대', zh: '这个价格有点低，最多能到十三美金。', pinyin: 'Zhège jiàgé yǒudiǎn dī, zuìduō néng dào shísān měijīn.', kr: '이 가격은 조금 낮습니다. 최대 13달러까지 가능합니다.' },
        { speaker: '나', zh: '好，我们接受十三美金，但希望包含运费。', pinyin: 'Hǎo, wǒmen jiēshòu shísān měijīn, dàn xīwàng bāohán yùnfèi.', kr: '좋습니다. 13달러를 수락하겠습니다. 하지만 운송비 포함을 원합니다.' },
        { speaker: '상대', zh: '可以，我们提供CIF价格，包括到仁川港。', pinyin: 'Kěyǐ, wǒmen tígōng CIF jiàgé, bāokuò dào Rénchuan gǎng.', kr: '네, 저희가 인천항까지의 CIF 가격을 제공하겠습니다.' },
      ],
    },
    {
      title: '납기 협의',
      icon: '📅',
      lines: [
        { speaker: '나', zh: '这批货什么时候能发出？', pinyin: 'Zhè pī huò shénme shíhòu néng fāchū?', kr: '이 화물은 언제 발송할 수 있나요?' },
        { speaker: '상대', zh: '通常需要四十五天生产周期。', pinyin: 'Tōngcháng xūyào sìshíwǔ tiān shēngchǎn zhōuqī.', kr: '보통 45일의 생산 사이클이 필요합니다.' },
        { speaker: '나', zh: '我们的客户急需，能否压缩到三十天？', pinyin: 'Wǒmen de kèhù jí xū, néng fǒu yāsuō dào sānshí tiān?', kr: '고객이 급하게 필요합니다. 30일로 단축 가능한가요?' },
        { speaker: '상대', zh: '需要加班生产，费用会增加百分之十。', pinyin: 'Xūyào jiābān shēngchǎn, fèiyòng huì zēngjiā bǎifēnzhī shí.', kr: '야근 생산이 필요하여 비용이 10% 증가합니다.' },
        { speaker: '나', zh: '可以接受，请安排加急生产。', pinyin: 'Kěyǐ jiēshòu, qǐng ānpái jiājí shēngchǎn.', kr: '수락합니다. 긴급 생산을 배정해주세요.' },
      ],
    },
  ],
  advanced: [
    {
      title: '불량품 클레임',
      icon: '⚠️',
      lines: [
        { speaker: '나', zh: '这批货到货后，我们发现有三百个产品存在质量问题。', pinyin: 'Zhè pī huò dàohuò hòu, wǒmen fāxiàn yǒu sānbǎi gè chǎnpǐn cúnzài zhìliàng wèntí.', kr: '이 화물 입고 후 300개 제품에 품질 문제가 있음을 발견했습니다.' },
        { speaker: '상대', zh: '非常抱歉，请发送详细的质检报告和照片。', pinyin: 'Fēicháng bàoqiàn, qǐng fāsòng xiángxì de zhìjiǎn bàogào hé zhàopiàn.', kr: '대단히 죄송합니다. 상세한 품질검사 보고서와 사진을 보내주세요.' },
        { speaker: '나', zh: '我们要求更换全部不良品，并承担所有相关费用。', pinyin: 'Wǒmen yāoqiú gēnghuàn quánbù bùliángpǐn, bìng chéngdān suǒyǒu xiāngguān fèiyòng.', kr: '모든 불량품 교환을 요구하며, 관련 모든 비용을 부담하시기 바랍니다.' },
        { speaker: '상대', zh: '我们会尽快安排重新生产，并优先发货。费用方面，我们愿意承担生产成本，运费希望各承担一半。', pinyin: 'Wǒmen huì jǐnkuài ānpái chóngxīn shēngchǎn, bìng yōuxiān fāhuò. Fèiyòng fāngmiàn, wǒmen yuànyì chéngdān shēngchǎn chéngběn, yùnfèi xīwàng gè chéngdān yī bàn.', kr: '최대한 빨리 재생산을 배정하고 우선 발송하겠습니다. 비용 면에서 생산 비용은 부담하겠으나 운송비는 절반씩 부담하길 원합니다.' },
        { speaker: '나', zh: '运费问题可以接受，但请确保这次质量无误。', pinyin: 'Yùnfèi wèntí kěyǐ jiēshòu, dàn qǐng quèbǎo zhè cì zhìliàng wúwù.', kr: '운송비 문제는 수락할 수 있습니다. 하지만 이번엔 품질에 문제가 없도록 확인해주세요.' },
      ],
    },
    {
      title: '독점 대리점 계약',
      icon: '🤝',
      lines: [
        { speaker: '나', zh: '我们有意在韩国独家销售贵公司的LED产品，请问贵公司是否有兴趣？', pinyin: 'Wǒmen yǒuyì zài Hánguó dújiā xiāoshòu guì gōngsī de LED chǎnpǐn, qǐngwèn guì gōngsī shìfǒu yǒu xìngqù?', kr: '저희는 한국에서 귀사 LED 제품을 독점 판매할 의향이 있습니다. 귀사는 관심이 있으신가요?' },
        { speaker: '상대', zh: '我们对此很感兴趣。请问贵方的年销售目标是多少？', pinyin: 'Wǒmen duì cǐ hěn gǎn xìngqù. Qǐngwèn guìfāng de nián xiāoshòu mùbiāo shì duōshao?', kr: '저희도 매우 관심이 있습니다. 귀사의 연간 판매 목표는 얼마인가요?' },
        { speaker: '나', zh: '第一年保底一百万美元，第二年目标三百万美元。', pinyin: 'Dì yī nián bǎodǐ yībǎi wàn měiyuán, dì èr nián mùbiāo sānbǎi wàn měiyuán.', kr: '첫 해 최소 100만 달러, 두 번째 해 목표 300만 달러입니다.' },
        { speaker: '상대', zh: '保底金额可以接受，我们可以给予独家授权，但条件是完成年度目标。', pinyin: 'Bǎodǐ jīn\'é kěyǐ jiēshòu, wǒmen kěyǐ jǐyǔ dújiā shòuquán, dàn tiáojiàn shì wánchéng niándù mùbiāo.', kr: '최소 금액은 수락 가능합니다. 독점권을 부여할 수 있으나, 조건은 연간 목표 달성입니다.' },
        { speaker: '나', zh: '没问题，请准备独家代理协议草案，我们法务部门会审核。', pinyin: 'Méi wèntí, qǐng zhǔnbèi dújiā dàilǐ xiéyì cǎo\'àn, wǒmen fǎwù bùmén huì shěnhé.', kr: '문제없습니다. 독점 대리점 협의서 초안을 준비해주세요. 저희 법무 부서에서 검토하겠습니다.' },
      ],
    },
  ],
};

const VOCAB_PRESETS: Record<Level, Array<{ word: string; pronunciation: string; translation: string; example: string }>> = {
  beginner: [
    { word: '你好', pronunciation: 'nǐ hǎo', translation: '안녕하세요', example: '你好！很高兴认识你。' },
    { word: '谢谢', pronunciation: 'xièxie', translation: '감사합니다', example: '谢谢你的帮助。' },
    { word: '价格', pronunciation: 'jiàgé', translation: '가격', example: '这个价格可以商量。' },
    { word: '质量', pronunciation: 'zhìliàng', translation: '품질', example: '这个产品质量很好。' },
    { word: '样品', pronunciation: 'yàngpǐn', translation: '샘플', example: '请先发一个样品。' },
    { word: '发货', pronunciation: 'fāhuò', translation: '발송하다', example: '什么时候发货？' },
    { word: '工厂', pronunciation: 'gōngchǎng', translation: '공장', example: '我们的工厂在广州。' },
    { word: '认证', pronunciation: 'rènzhèng', translation: '인증', example: '产品需要KC认证。' },
    { word: '合同', pronunciation: 'hétong', translation: '계약서', example: '请签合同。' },
    { word: '交货期', pronunciation: 'jiāohuòqī', translation: '납기일', example: '交货期是三十天。' },
  ],
  intermediate: [
    { word: '报价单', pronunciation: 'bàojiàdān', translation: '견적서', example: '请发一份详细的报价单。' },
    { word: '订单', pronunciation: 'dìngdān', translation: '주문서', example: '我们确认这份订单。' },
    { word: '不良率', pronunciation: 'bùliánglǜ', translation: '불량률', example: '不良率不超过百分之一。' },
    { word: '货款', pronunciation: 'huòkuǎn', translation: '대금', example: '货款已经到账。' },
    { word: '检验', pronunciation: 'jiǎnyàn', translation: '검사', example: '出货前需要检验。' },
    { word: '包装', pronunciation: 'bāozhuāng', translation: '포장', example: '请按照我们的要求包装。' },
    { word: '折扣', pronunciation: 'zhékòu', translation: '할인', example: '大量购买可以给折扣。' },
    { word: '提前', pronunciation: 'tíqián', translation: '앞당기다', example: '交货期能否提前？' },
    { word: '押金', pronunciation: 'yājīn', translation: '보증금/계약금', example: '需要支付百分之三十的押金。' },
    { word: '验货', pronunciation: 'yànhuò', translation: '검품', example: '发货前需要验货。' },
  ],
  advanced: [
    { word: '仲裁', pronunciation: 'zhòngcái', translation: '중재', example: '争议提交仲裁解决。' },
    { word: '违约金', pronunciation: 'wéiyuējīn', translation: '위약금', example: '违约需支付违约金。' },
    { word: '知识产权', pronunciation: 'zhīshí chǎnquán', translation: '지식재산권', example: '保护知识产权是必须的。' },
    { word: '独家代理', pronunciation: 'dújiā dàilǐ', translation: '독점 대리', example: '我们是该品牌在韩国的独家代理。' },
    { word: '不可抗力', pronunciation: 'bùkě kànglì', translation: '불가항력', example: '疫情属于不可抗力因素。' },
    { word: '框架协议', pronunciation: 'kuàngjià xiéyì', translation: '프레임워크 협약', example: '签订战略合作框架协议。' },
    { word: '尽职调查', pronunciation: 'jìnzhí diàochá', translation: '실사', example: '投资前要进行尽职调查。' },
    { word: '竞业禁止', pronunciation: 'jìngyè jìnzhǐ', translation: '경업금지', example: '合同中包含竞业禁止条款。' },
    { word: '担保', pronunciation: 'dānbǎo', translation: '보증', example: '需要提供银行担保。' },
    { word: '合规', pronunciation: 'héguī', translation: '규정 준수', example: '产品必须符合合规要求。' },
  ],
};

const YOUTUBE_VIDEOS: Record<Level, Array<{ title: string; id: string; desc: string }>> = {
  beginner: [
    { title: '중국어 기초 발음 (병음)', id: 'ygOHSNO8raM', desc: '성모·운모 완벽 정리' },
    { title: '비즈니스 중국어 기초 100문장', id: '9lMbBPb6-o4', desc: '기초 비즈니스 표현' },
    { title: '숫자·가격 말하기', id: 'WV1PGjBfuqM', desc: '중국어 숫자 완전 정복' },
  ],
  intermediate: [
    { title: '비즈니스 협상 중국어', id: 'vNWuCMs9pIo', desc: '협상 실전 표현 모음' },
    { title: '무역 실무 중국어', id: 'aqkZME4S2Uc', desc: '수출입 업무 필수 표현' },
    { title: '중국어 이메일 쓰기', id: '2g6-5xH6-oM', desc: '비즈니스 이메일 작성법' },
  ],
  advanced: [
    { title: '계약서 중국어 읽기', id: 'bVMWWB8HubI', desc: '법률·계약 전문 용어' },
    { title: '중국 비즈니스 문화', id: 'xHqJDC2EEZY', desc: '관시·체면 문화 이해' },
    { title: 'HSK 6급 고급 표현', id: 'jWbPJ4xoNWg', desc: '고급 비즈니스 어휘' },
  ],
};

const LEVEL_LABELS: Record<Level, { kr: string; zh: string; color: string; bg: string }> = {
  beginner: { kr: '초급', zh: '初级', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/40' },
  intermediate: { kr: '중급', zh: '中级', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' },
  advanced: { kr: '고급', zh: '高级', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/40' },
};

const OLLAMA_MODELS = [
  { id: 'qwen3', name: 'Qwen 3', emoji: '🔮', desc: '중국어 최강' },
  { id: 'qwen3.5', name: 'Qwen 3.5', emoji: '🔮', desc: '최신 멀티모달' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', emoji: '🧠', desc: '중국어 추론' },
  { id: 'llama3.3', name: 'Llama 3.3', emoji: '🦙', desc: '범용' },
  { id: 'gemma3', name: 'Gemma 3', emoji: '💎', desc: 'Google 경량' },
];

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ChinesePage() {
  const [level, setLevel] = useState<Level>('beginner');
  const [tab, setTab] = useState<Tab>('vocab');

  // 단어장
  const [words, setWords] = useState<VocabWord[]>([]);
  const [addWord, setAddWord] = useState({ word: '', pronunciation: '', translation: '', example: '' });
  const [wordLoading, setWordLoading] = useState(false);
  const [quizMode, setQuizMode] = useState<QuizMode>(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizFlipped, setQuizFlipped] = useState(false);
  const [quizChoices, setQuizChoices] = useState<VocabWord[]>([]);
  const [quizAnswer, setQuizAnswer] = useState<'correct' | 'wrong' | null>(null);
  const [quizInput, setQuizInput] = useState('');
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });

  // 문법
  const [grammarOpen, setGrammarOpen] = useState<number | null>(0);

  // 회화
  const [convOpen, setConvOpen] = useState<number | null>(0);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showKr, setShowKr] = useState(true);

  // AI
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('qwen3');
  const [aiMode, setAiMode] = useState<'tutor' | 'business' | 'free'>('tutor');
  const aiScrollRef = useRef<HTMLDivElement>(null);

  // 단어 로드
  useEffect(() => {
    fetch('/api/language/vocabulary?language=zh')
      .then(r => r.json())
      .then(d => setWords(d.words || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (aiScrollRef.current) aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
  }, [aiMessages]);

  // 단어 추가
  const saveWord = async (w = addWord) => {
    if (!w.word || !w.translation) return;
    setWordLoading(true);
    try {
      const res = await fetch('/api/language/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'zh', ...w }),
      });
      const d = await res.json();
      if (d.word) {
        setWords(prev => [d.word, ...prev.filter(x => x.id !== d.word.id)]);
        setAddWord({ word: '', pronunciation: '', translation: '', example: '' });
      }
    } finally { setWordLoading(false); }
  };

  // 프리셋 단어 추가
  const addPreset = async (p: typeof VOCAB_PRESETS.beginner[0]) => {
    await saveWord({ word: p.word, pronunciation: p.pronunciation, translation: p.translation, example: p.example });
  };

  // 단어 삭제
  const deleteWord = async (id: string) => {
    await fetch(`/api/language/vocabulary?id=${id}`, { method: 'DELETE' });
    setWords(prev => prev.filter(w => w.id !== id));
  };

  // 레벨별 단어 필터 (저장된 단어에서 레벨로 구분하지 않으므로 전체 표시)
  const levelWords = words;

  // 퀴즈 초기화
  const startQuiz = (mode: QuizMode) => {
    if (levelWords.length < 2) return;
    setQuizMode(mode);
    setQuizIdx(0);
    setQuizFlipped(false);
    setQuizAnswer(null);
    setQuizInput('');
    setQuizScore({ correct: 0, total: 0 });
    if (mode === 'choice') buildChoices(0);
  };

  const buildChoices = useCallback((idx: number) => {
    const correct = levelWords[idx % levelWords.length];
    const others = levelWords.filter((_, i) => i !== idx % levelWords.length);
    const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 3);
    const choices = [...shuffled, correct].sort(() => Math.random() - 0.5);
    setQuizChoices(choices);
  }, [levelWords]);

  const nextQuiz = () => {
    const next = (quizIdx + 1) % levelWords.length;
    setQuizIdx(next);
    setQuizFlipped(false);
    setQuizAnswer(null);
    setQuizInput('');
    if (quizMode === 'choice') buildChoices(next);
  };

  const checkInput = () => {
    const current = levelWords[quizIdx % levelWords.length];
    const correct = quizInput.trim().toLowerCase() === current.translation.toLowerCase();
    setQuizAnswer(correct ? 'correct' : 'wrong');
    setQuizScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  };

  // AI 대화
  const sendAi = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);

    const systemPrompts = {
      tutor: `당신은 중국어 튜터입니다. 학습자 레벨은 ${LEVEL_LABELS[level].kr}입니다. 중국어로 대화하되, 한국어 번역과 병음을 함께 제공하세요. 핵심 단어는 [[단어|한국어|병음]] 형식으로 표시하세요. 문법 오류가 있으면 친절하게 교정해주세요.`,
      business: `당신은 비즈니스 중국어 전문 튜터입니다. LED 조명 무역 업무에 특화된 중국어를 가르칩니다. ${LEVEL_LABELS[level].kr} 레벨에 맞는 무역/협상 표현을 교육해주세요. 핵심 비즈니스 단어는 [[단어|한국어|병음]] 형식으로 표시하세요.`,
      free: `You are a helpful Chinese language assistant. The user is a Korean speaker learning Chinese at ${level} level. Respond naturally in Chinese with Korean translations.`,
    };

    try {
      const res = await fetch('/api/chinese/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...aiMessages, { role: 'user', content: userMsg }],
          model: selectedModel,
          systemPrompt: systemPrompts[aiMode],
        }),
      });

      if (!res.body) { setAiLoading(false); return; }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';

      setAiMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const dl = line.split('\n').find(l => l.startsWith('data: '));
          if (!dl) continue;
          try {
            const j = JSON.parse(dl.slice(6));
            if (j.chunk) {
              full += j.chunk;
              setAiMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: full };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `오류: ${e}` }]);
    } finally { setAiLoading(false); }
  };

  // AI 메시지 렌더링 (파싱된 단어 강조)
  const renderAiContent = (content: string) => {
    const parts = content.split(/\[\[([^\]]+)\]\]/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const [word, kr, pinyin] = part.split('|');
        return (
          <span key={i} className="inline-flex flex-col items-center mx-1 cursor-pointer group"
            onClick={() => saveWord({ word, pronunciation: pinyin || '', translation: kr || '', example: '' })}>
            <span className="text-amber-300 font-bold border-b border-amber-400/50 group-hover:border-amber-400">{word}</span>
            {pinyin && <span className="text-[10px] text-amber-400/70">{pinyin}</span>}
            <span className="text-[10px] text-slate-400">{kr}</span>
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const currentGrammar = GRAMMAR_DATA[level];
  const currentConv = CONVERSATION_DATA[level];
  const currentVideos = YOUTUBE_VIDEOS[level];
  const currentPresets = VOCAB_PRESETS[level];
  const lv = LEVEL_LABELS[level];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">

      {/* ── 헤더 ── */}
      <div className="flex-shrink-0 bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              🇨🇳 중국어 학습센터 <span className="text-sm font-normal text-red-400">普通话</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">비즈니스 중국어 · 무역 실전 표현 · AI 튜터</p>
          </div>

          {/* 레벨 선택 */}
          <div className="flex gap-2">
            {(['beginner', 'intermediate', 'advanced'] as Level[]).map(l => (
              <button key={l} onClick={() => setLevel(l)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-all ${
                  level === l ? LEVEL_LABELS[l].bg + ' ' + LEVEL_LABELS[l].color : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}>
                {LEVEL_LABELS[l].zh} {LEVEL_LABELS[l].kr}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mt-4">
          {[
            { id: 'vocab', label: '📚 단어장', },
            { id: 'grammar', label: '📖 문법·패턴', },
            { id: 'conversation', label: '💬 회화', },
            { id: 'video', label: '🎥 영상', },
            { id: 'ai', label: '🤖 AI 대화', },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-red-700 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 콘텐츠 ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ══ 단어장 ══ */}
        {tab === 'vocab' && (
          <div className="p-6 space-y-6">

            {/* 단어 추가 */}
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">✏️ 단어 추가</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <input value={addWord.word} onChange={e => setAddWord(p => ({...p, word: e.target.value}))}
                  placeholder="한자 (你好)" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500" />
                <input value={addWord.pronunciation} onChange={e => setAddWord(p => ({...p, pronunciation: e.target.value}))}
                  placeholder="병음 (nǐ hǎo)" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500" />
                <input value={addWord.translation} onChange={e => setAddWord(p => ({...p, translation: e.target.value}))}
                  placeholder="뜻 (안녕하세요)" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500" />
                <input value={addWord.example} onChange={e => setAddWord(p => ({...p, example: e.target.value}))}
                  placeholder="예문" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500" />
              </div>
              <button onClick={() => saveWord()} disabled={wordLoading || !addWord.word || !addWord.translation}
                className="px-5 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                {wordLoading ? '저장 중...' : '+ 저장'}
              </button>
            </div>

            {/* 프리셋 단어 */}
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                ⚡ {lv.kr} 추천 단어 <span className={`text-xs ${lv.color}`}>{lv.zh}</span>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {currentPresets.map(p => {
                  const saved = words.some(w => w.word === p.word);
                  return (
                    <button key={p.word} onClick={() => !saved && addPreset(p)} disabled={saved}
                      className={`rounded-xl p-3 text-left transition-all border ${
                        saved ? 'bg-emerald-900/20 border-emerald-700/40 opacity-60' : 'bg-slate-800 border-slate-600 hover:border-red-500/50 hover:bg-slate-700'
                      }`}>
                      <div className="text-lg font-bold text-white mb-0.5">{p.word}</div>
                      <div className="text-[11px] text-amber-400">{p.pronunciation}</div>
                      <div className="text-[11px] text-slate-300">{p.translation}</div>
                      {saved && <div className="text-[10px] text-emerald-400 mt-1">✓ 저장됨</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 퀴즈 모드 */}
            {levelWords.length >= 2 && (
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-white">🎯 암기 & 퀴즈</h2>
                  {quizMode && (
                    <div className="text-xs text-slate-400">
                      {quizScore.correct}/{quizScore.total} 정답 · {quizIdx + 1}/{levelWords.length}번째
                    </div>
                  )}
                </div>

                {!quizMode ? (
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={() => startQuiz('flash')} className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">🃏 플래시카드</button>
                    <button onClick={() => startQuiz('choice')} className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white rounded-lg text-sm font-medium">🔤 4지선다</button>
                    <button onClick={() => startQuiz('input')} className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">✍️ 직접 입력</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 플래시카드 */}
                    {quizMode === 'flash' && levelWords[quizIdx % levelWords.length] && (
                      <div>
                        <div onClick={() => setQuizFlipped(!quizFlipped)}
                          className="cursor-pointer bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600 rounded-2xl p-10 text-center min-h-[160px] flex flex-col items-center justify-center hover:border-red-500/50 transition-all">
                          {!quizFlipped ? (
                            <>
                              <div className="text-5xl font-bold text-white mb-2">{levelWords[quizIdx % levelWords.length].word}</div>
                              {levelWords[quizIdx % levelWords.length].pronunciation && (
                                <div className="text-lg text-amber-400">{levelWords[quizIdx % levelWords.length].pronunciation}</div>
                              )}
                              <div className="text-xs text-slate-500 mt-4">클릭해서 뒤집기</div>
                            </>
                          ) : (
                            <>
                              <div className="text-3xl font-bold text-emerald-300 mb-2">{levelWords[quizIdx % levelWords.length].translation}</div>
                              {levelWords[quizIdx % levelWords.length].example && (
                                <div className="text-sm text-slate-400 mt-2">{levelWords[quizIdx % levelWords.length].example}</div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button onClick={nextQuiz} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">다음 →</button>
                          <button onClick={() => setQuizMode(null)} className="px-4 py-2 bg-slate-800 rounded-lg text-sm text-slate-400">종료</button>
                        </div>
                      </div>
                    )}

                    {/* 4지선다 */}
                    {quizMode === 'choice' && levelWords[quizIdx % levelWords.length] && (
                      <div>
                        <div className="text-center mb-6">
                          <div className="text-5xl font-bold text-white mb-2">{levelWords[quizIdx % levelWords.length].word}</div>
                          <div className="text-lg text-amber-400">{levelWords[quizIdx % levelWords.length].pronunciation}</div>
                          <div className="text-sm text-slate-400 mt-1">뜻을 고르세요</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {quizChoices.map(choice => {
                            const isCorrect = choice.id === levelWords[quizIdx % levelWords.length].id;
                            const bg = quizAnswer === null ? 'bg-slate-800 hover:bg-slate-700 border-slate-600' :
                              isCorrect ? 'bg-emerald-900/50 border-emerald-500' :
                              quizAnswer === 'wrong' && choice.id !== levelWords[quizIdx % levelWords.length].id ? 'bg-red-900/50 border-red-500' : 'bg-slate-800 border-slate-600';
                            return (
                              <button key={choice.id} disabled={quizAnswer !== null}
                                onClick={() => {
                                  const correct = choice.id === levelWords[quizIdx % levelWords.length].id;
                                  setQuizAnswer(correct ? 'correct' : 'wrong');
                                  setQuizScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
                                }}
                                className={`py-3 px-4 rounded-xl border text-sm font-medium text-white transition-all ${bg}`}>
                                {choice.translation}
                              </button>
                            );
                          })}
                        </div>
                        {quizAnswer && (
                          <button onClick={nextQuiz} className="w-full mt-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm text-white font-medium">
                            {quizAnswer === 'correct' ? '✓ 정답! 다음 →' : '✗ 오답. 다음 →'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* 직접 입력 */}
                    {quizMode === 'input' && levelWords[quizIdx % levelWords.length] && (
                      <div>
                        <div className="text-center mb-6">
                          <div className="text-5xl font-bold text-white mb-2">{levelWords[quizIdx % levelWords.length].word}</div>
                          <div className="text-lg text-amber-400">{levelWords[quizIdx % levelWords.length].pronunciation}</div>
                          <div className="text-sm text-slate-400 mt-1">한국어 뜻을 입력하세요</div>
                        </div>
                        <div className="flex gap-2">
                          <input value={quizInput} onChange={e => setQuizInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !quizAnswer && checkInput()}
                            disabled={!!quizAnswer}
                            placeholder="뜻을 입력하세요..."
                            className={`flex-1 bg-slate-800 border rounded-lg px-4 py-2 text-white text-sm focus:outline-none ${
                              quizAnswer === 'correct' ? 'border-emerald-500' : quizAnswer === 'wrong' ? 'border-red-500' : 'border-slate-600 focus:border-red-500'
                            }`} />
                          {!quizAnswer ? (
                            <button onClick={checkInput} className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm text-white">확인</button>
                          ) : (
                            <button onClick={nextQuiz} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white">다음</button>
                          )}
                        </div>
                        {quizAnswer && (
                          <div className={`mt-2 text-sm font-medium ${quizAnswer === 'correct' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {quizAnswer === 'correct' ? '✓ 정답!' : `✗ 정답: ${levelWords[quizIdx % levelWords.length].translation}`}
                          </div>
                        )}
                      </div>
                    )}

                    {quizMode !== 'flash' && (
                      <button onClick={() => setQuizMode(null)} className="text-xs text-slate-500 hover:text-slate-300">퀴즈 종료</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 내 단어장 */}
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-4">📂 내 단어장 <span className="text-slate-500 font-normal">({levelWords.length}개)</span></h2>
              {levelWords.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">저장된 단어가 없습니다. 위에서 추가하거나 추천 단어를 클릭하세요.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {levelWords.map(w => (
                    <div key={w.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-red-500/30 transition-all group">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-2xl font-bold text-white">{w.word}</div>
                          {w.pronunciation && <div className="text-sm text-amber-400 mt-0.5">{w.pronunciation}</div>}
                          <div className="text-sm text-slate-300 mt-1">{w.translation}</div>
                          {w.example && <div className="text-xs text-slate-500 mt-2 italic">{w.example}</div>}
                        </div>
                        <button onClick={() => deleteWord(w.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-lg leading-none">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ 문법·패턴 ══ */}
        {tab === 'grammar' && (
          <div className="p-6 space-y-3">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold mb-4 ${lv.bg} ${lv.color}`}>
              {lv.zh} {lv.kr} 문법 & 비즈니스 패턴
            </div>
            {currentGrammar.map((g, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                <button onClick={() => setGrammarOpen(grammarOpen === i ? null : i)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                  <div>
                    <div className="font-bold text-white text-sm">{g.title}</div>
                    <div className="text-xs text-amber-400 mt-1 font-mono">{g.pattern}</div>
                  </div>
                  <span className="text-slate-500 text-lg">{grammarOpen === i ? '▲' : '▼'}</span>
                </button>
                {grammarOpen === i && (
                  <div className="px-6 pb-6 space-y-4 border-t border-slate-700/50">
                    <div className="mt-4 bg-slate-800/50 rounded-xl p-4">
                      <div className="text-xs text-slate-400 mb-1">구조</div>
                      <div className="text-sm text-sky-300 font-medium">{g.structure}</div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400 font-medium">예문</div>
                      {g.examples.map((ex, j) => (
                        <div key={j} className="bg-slate-800 rounded-xl p-4 border-l-2 border-red-600/50">
                          <div className="text-lg font-medium text-white mb-1">{ex.zh}</div>
                          <div className="text-sm text-amber-400 mb-1">{ex.pinyin}</div>
                          <div className="text-sm text-slate-300">{ex.kr}</div>
                        </div>
                      ))}
                    </div>
                    {g.notes && (
                      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-sm text-amber-200/80">
                        💡 {g.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══ 회화 ══ */}
        {tab === 'conversation' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${lv.bg} ${lv.color}`}>
                {lv.zh} {lv.kr} 실전 회화
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowPinyin(!showPinyin)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${showPinyin ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                  병음 {showPinyin ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => setShowKr(!showKr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${showKr ? 'bg-sky-500/20 border-sky-500/40 text-sky-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                  한국어 {showKr ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
            {currentConv.map((c, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                <button onClick={() => setConvOpen(convOpen === i ? null : i)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <span className="font-bold text-white text-sm">{c.title}</span>
                  </div>
                  <span className="text-slate-500 text-lg">{convOpen === i ? '▲' : '▼'}</span>
                </button>
                {convOpen === i && (
                  <div className="border-t border-slate-700/50 p-6 space-y-4">
                    {c.lines.map((line, j) => (
                      <div key={j} className={`flex gap-4 ${line.speaker === '나' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          line.speaker === '나' ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-200'
                        }`}>
                          {line.speaker === '나' ? '나' : '他'}
                        </div>
                        <div className={`flex-1 max-w-lg ${line.speaker === '나' ? 'text-right' : ''}`}>
                          <div className={`inline-block rounded-2xl px-4 py-3 text-left ${
                            line.speaker === '나' ? 'bg-red-900/40 border border-red-700/30' : 'bg-slate-800 border border-slate-700'
                          }`}>
                            <div className="text-base font-medium text-white">{line.zh}</div>
                            {showPinyin && <div className="text-sm text-amber-400 mt-1">{line.pinyin}</div>}
                            {showKr && <div className="text-sm text-slate-300 mt-1">{line.kr}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ══ 영상 ══ */}
        {tab === 'video' && (
          <div className="p-6 space-y-4">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold mb-4 ${lv.bg} ${lv.color}`}>
              {lv.zh} {lv.kr} 추천 영상
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {currentVideos.map(v => (
                <div key={v.id} className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                  <div className="relative pb-[56.25%]">
                    <iframe
                      src={`https://www.youtube.com/embed/${v.id}`}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-bold text-white mb-1">{v.title}</div>
                    <div className="text-xs text-slate-400">{v.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 커스텀 YouTube 검색 */}
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 mt-6">
              <h3 className="text-sm font-bold text-white mb-3">🔗 YouTube URL 직접 입력</h3>
              <YouTubeInput />
            </div>
          </div>
        )}

        {/* ══ AI 대화 ══ */}
        {tab === 'ai' && (
          <div className="h-full flex flex-col p-6" style={{ minHeight: 'calc(100vh - 200px)' }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {/* 모드 */}
              <div className="flex gap-2">
                {[
                  { id: 'tutor', label: '📚 튜터 모드' },
                  { id: 'business', label: '💼 비즈니스' },
                  { id: 'free', label: '🗣️ 자유 대화' },
                ].map(m => (
                  <button key={m.id} onClick={() => setAiMode(m.id as typeof aiMode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      aiMode === m.id ? 'bg-red-700/40 border-red-500/60 text-red-300' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {/* 모델 */}
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500">
                {OLLAMA_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.emoji} {m.name} — {m.desc}</option>
                ))}
              </select>
              <button onClick={() => setAiMessages([])} className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded-lg text-slate-400 hover:bg-slate-700">
                🗑️ 초기화
              </button>
            </div>

            {/* 메시지 영역 */}
            <div ref={aiScrollRef} className="flex-1 overflow-y-auto space-y-4 min-h-[400px] max-h-[500px] mb-4">
              {aiMessages.length === 0 && (
                <div className="text-center text-slate-500 py-12">
                  <div className="text-4xl mb-3">🤖</div>
                  <div className="text-sm">AI 튜터와 중국어로 대화해보세요</div>
                  <div className="text-xs mt-2 text-slate-600">단어를 클릭하면 자동으로 단어장에 저장됩니다</div>
                  <div className="grid grid-cols-2 gap-2 mt-6 max-w-sm mx-auto">
                    {[
                      '오늘 LED 제품 가격에 대해 물어보고 싶어요',
                      '비즈니스 이메일 시작 문구를 가르쳐주세요',
                      '납기 협상 연습을 하고 싶어요',
                      '你好！중국어로 자기소개 해주세요',
                    ].map(s => (
                      <button key={s} onClick={() => setAiInput(s)}
                        className="text-left text-xs bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-300 hover:border-red-500/50 hover:bg-slate-700 transition-all">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    m.role === 'user' ? 'bg-red-700' : 'bg-slate-700'
                  }`}>
                    {m.role === 'user' ? '나' : '🤖'}
                  </div>
                  <div className={`flex-1 max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-red-900/40 border border-red-700/30 text-white' : 'bg-slate-800 border border-slate-700 text-slate-100'
                  }`}>
                    {m.role === 'assistant' ? renderAiContent(m.content) : m.content}
                    {i === aiMessages.length - 1 && m.role === 'assistant' && aiLoading && (
                      <span className="inline-block w-1.5 h-4 bg-red-400 ml-1 animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && aiMessages[aiMessages.length - 1]?.role === 'user' && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm">🤖</div>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex gap-1">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                  </div>
                </div>
              )}
            </div>

            {/* 입력창 */}
            <div className="flex gap-3">
              <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAi()}
                placeholder="중국어로 질문하거나 한국어로 학습 요청..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500" />
              <button onClick={sendAi} disabled={aiLoading || !aiInput.trim()}
                className="px-6 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">
                전송
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── YouTube URL 입력 컴포넌트 ─────────────────────────────────────────────────
function YouTubeInput() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState('');

  const extract = (u: string) => {
    const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return m?.[1] || '';
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="YouTube URL 붙여넣기..."
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500" />
        <button onClick={() => setVideoId(extract(url))}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium">
          재생
        </button>
      </div>
      {videoId && (
        <div className="relative pb-[56.25%] rounded-xl overflow-hidden">
          <iframe src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube" allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            className="absolute inset-0 w-full h-full" />
        </div>
      )}
    </div>
  );
}
