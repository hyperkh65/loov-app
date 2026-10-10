export interface ConversationLine {
  speaker: 'A' | 'B';
  speakerName: string;
  chinese: string;
  pinyin: string;
  korean: string;
}

export interface Conversation {
  id: string;
  title: string;
  titleKo: string;
  category: string;
  difficulty: '초급' | '중급' | '고급';
  lines: ConversationLine[];
  keywords: string[];
}

export const CONVERSATION_CATEGORIES = [
  '전체', '무역상담', '가격협상', '납기·배송', '품질·클레임', '결제·금융',
  '전시회·박람회', '공장방문', '계약·법무', '일상인사', '식사·접대', '교통·이동',
  '호텔·숙박', '이메일·소통', '회의', '파트너십', '기술·제품', '클레임처리',
];

export const CONVERSATIONS: Conversation[] = [
  // ─── 무역상담 ───
  {
    id: 'trade-001',
    title: '初次见面的商务洽谈',
    titleKo: '첫 비즈니스 미팅',
    category: '무역상담',
    difficulty: '초급',
    keywords: ['처음만나다', '소개', '회사소개', '관심'],
    lines: [
      { speaker: 'A', speakerName: '김 대표', chinese: '您好！我是韩国LED照明公司的金代表。', pinyin: 'Nín hǎo! Wǒ shì Hánguó LED zhàomíng gōngsī de Jīn dàibiǎo.', korean: '안녕하세요! 저는 한국 LED조명 회사의 김 대표입니다.' },
      { speaker: 'B', speakerName: '왕 총경리', chinese: '您好！我是王总经理，欢迎来我们公司参观。', pinyin: 'Nín hǎo! Wǒ shì Wáng zǒngjīnglǐ, huānyíng lái wǒmen gōngsī cānguān.', korean: '안녕하세요! 저는 왕 총경리입니다. 저희 회사 방문을 환영합니다.' },
      { speaker: 'A', speakerName: '김 대표', chinese: '很高兴认识您。我们公司主要做LED照明产品的出口业务。', pinyin: 'Hěn gāoxìng rènshi nín. Wǒmen gōngsī zhǔyào zuò LED zhàomíng chǎnpǐn de chūkǒu yèwù.', korean: '만나서 반갑습니다. 저희 회사는 주로 LED조명 제품 수출 업무를 합니다.' },
      { speaker: 'B', speakerName: '왕 총경리', chinese: '是吗？我们正在寻找优质的LED供应商，这次合作很有意义。', pinyin: 'Shì ma? Wǒmen zhèngzài xúnzhǎo yōuzhì de LED gōngyìngshāng, zhè cì hézuò hěn yǒu yìyì.', korean: '그렇군요? 저희도 우수한 LED 공급업체를 찾고 있었는데, 이번 협력이 매우 의미 있을 것 같습니다.' },
      { speaker: 'A', speakerName: '김 대표', chinese: '我们的产品质量有保障，价格也很有竞争力。', pinyin: 'Wǒmen de chǎnpǐn zhìliàng yǒu bǎozhàng, jiàgé yě hěn yǒu jìngzhēnglì.', korean: '저희 제품은 품질이 보장되고 가격도 경쟁력이 있습니다.' },
      { speaker: 'B', speakerName: '왕 총경리', chinese: '那请给我们介绍一下产品规格和报价。', pinyin: 'Nà qǐng gěi wǒmen jièshào yīxià chǎnpǐn guīgé hé bàojià.', korean: '그렇다면 제품 사양과 견적을 소개해 주시겠습니까?' },
    ],
  },
  {
    id: 'trade-002',
    title: '产品介绍与需求确认',
    titleKo: '제품 소개 및 수요 확인',
    category: '무역상담',
    difficulty: '중급',
    keywords: ['제품소개', '사양', '수요', '카탈로그'],
    lines: [
      { speaker: 'A', speakerName: '영업담당', chinese: '这是我们最新款的工业照明产品目录，请过目。', pinyin: 'Zhè shì wǒmen zuìxīn kuǎn de gōngyè zhàomíng chǎnpǐn mùlù, qǐng guòmù.', korean: '이것이 저희 최신 산업용 조명 제품 카탈로그입니다. 살펴봐 주세요.' },
      { speaker: 'B', speakerName: '구매담당', chinese: '好的，我主要关注100W以上的工矿灯，你们有这类产品吗？', pinyin: 'Hǎo de, wǒ zhǔyào guānzhù 100W yǐshàng de gōngkuàng dēng, nǐmen yǒu zhè lèi chǎnpǐn ma?', korean: '네, 저는 주로 100W 이상의 산업용 등에 관심이 있는데, 이런 제품이 있나요?' },
      { speaker: 'A', speakerName: '영업담당', chinese: '当然！我们有100W、150W、200W三种规格，显色指数Ra≥80，色温可选3000K到6500K。', pinyin: 'Dāngrán! Wǒmen yǒu 100W, 150W, 200W sān zhǒng guīgé, xiǎnsè zhǐshù Ra ≥80, sètōng kě xuǎn 3000K dào 6500K.', korean: '물론이죠! 저희는 100W, 150W, 200W 세 가지 사양이 있으며, 연색지수 Ra≥80, 색온도는 3000K~6500K로 선택 가능합니다.' },
      { speaker: 'B', speakerName: '구매담당', chinese: '防护等级是多少？我们工厂环境比较恶劣。', pinyin: 'Fánghù děngjí shì duōshǎo? Wǒmen gōngchǎng huánjìng bǐjiào èliè.', korean: '방호등급은 얼마인가요? 저희 공장 환경이 좀 열악합니다.' },
      { speaker: 'A', speakerName: '영업담당', chinese: '防护等级IP65，可以防尘防水，非常适合恶劣环境使用。', pinyin: 'Fánghù děngjí IP65, kěyǐ fángchén fángshuǐ, fēicháng shìhé èliè huánjìng shǐyòng.', korean: '방호등급 IP65로 방진방수가 가능해 열악한 환경에서도 매우 적합합니다.' },
      { speaker: 'B', speakerName: '구매담당', chinese: '保修期多长时间？', pinyin: 'Bǎoxiū qī duō cháng shíjiān?', korean: '보증기간은 얼마나 되나요?' },
      { speaker: 'A', speakerName: '영업담당', chinese: '标准保修期三年，如果量大可以谈到五年。', pinyin: 'Biāozhǔn bǎoxiū qī sān nián, rúguǒ liàng dà kěyǐ tán dào wǔ nián.', korean: '표준 보증기간은 3년이며, 수량이 많으면 5년까지 협의 가능합니다.' },
    ],
  },

  // ─── 가격협상 ───
  {
    id: 'price-001',
    title: '价格谈判基础',
    titleKo: '가격 협상 기초',
    category: '가격협상',
    difficulty: '중급',
    keywords: ['가격', '할인', 'FOB', '단가'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '你们100W工矿灯的FOB价格是多少？', pinyin: 'Nǐmen 100W gōngkuàng dēng de FOB jiàgé shì duōshǎo?', korean: '100W 산업등의 FOB 가격은 얼마인가요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '目前FOB宁波价格是每只28美元，1000只起订。', pinyin: 'Mùqián FOB Níngbō jiàgé shì měi zhī 28 Měiyuán, 1000 zhī qǐ dìng.', korean: '현재 FOB 닝보 가격은 개당 28달러이며, 최소 1,000개 주문입니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '28美元太贵了，我们同类产品最低见过22美元，能接受吗？', pinyin: '28 Měiyuán tài guì le, wǒmen tónglèi chǎnpǐn zuìdī jiànguò 22 Měiyuán, néng jiēshòu ma?', korean: '28달러는 너무 비쌉니다. 비슷한 제품을 최저 22달러에 본 적이 있는데, 받아들일 수 있나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '22美元我们成本都不够，品质不一样。我们可以做到25美元，这已经是最低了。', pinyin: '22 Měiyuán wǒmen chéngběn dōu bùgòu, pǐnzhì bù yīyàng. Wǒmen kěyǐ zuò dào 25 Měiyuán, zhè yǐjīng shì zuìdī le.', korean: '22달러는 저희 원가도 안 됩니다. 품질이 다릅니다. 25달러까지는 가능하며, 이것이 최저가입니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '如果我们下5000只的订单，能不能做到24美元？', pinyin: 'Rúguǒ wǒmen xià 5000 zhī de dìngdān, néng bu néng zuò dào 24 Měiyuán?', korean: '5,000개 주문하면 24달러까지 가능한가요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '5000只的话，我们可以考虑24.5美元，附带免费质检报告。', pinyin: '5000 zhī de huà, wǒmen kěyǐ kǎolǜ 24.5 Měiyuán, fùdài miǎnfèi zhìjiǎn bàogào.', korean: '5,000개라면 24.5달러로 고려해 볼 수 있으며, 무료 품질검사 보고서를 제공합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '好，24.5美元我们接受，但交货期不能超过45天。', pinyin: 'Hǎo, 24.5 Měiyuán wǒmen jiēshòu, dàn jiāohuò qī bù néng chāoguò 45 tiān.', korean: '좋습니다. 24.5달러는 받아들이겠습니다만, 납기는 45일을 초과할 수 없습니다.' },
    ],
  },
  {
    id: 'price-002',
    title: '大批量折扣谈判',
    titleKo: '대량 할인 협상',
    category: '가격협상',
    difficulty: '고급',
    keywords: ['대량', '할인율', '계단가격', '독점'],
    lines: [
      { speaker: 'A', speakerName: '대형바이어', chinese: '我们有意向在贵司采购全年约50万个LED模组，请给出阶梯报价。', pinyin: 'Wǒmen yǒu yìxiàng zài guì sī cǎigòu quánnián yuē 50 wàn gè LED mózǔ, qǐng gěichū jiētī bàojià.', korean: '저희는 귀사에서 연간 약 50만 개 LED 모듈을 구매할 의향이 있습니다. 계단식 견적을 주세요.' },
      { speaker: 'B', speakerName: '제조업체', chinese: '太好了！10万以内单价$2.8，10~20万$2.5，20万以上$2.2，50万以上我们特别优惠$1.9。', pinyin: 'Tài hǎo le! 10 wàn yǐnèi dānjià $2.8, 10~20 wàn $2.5, 20 wàn yǐshàng $2.2, 50 wàn yǐshàng wǒmen tèbié yōuhuì $1.9.', korean: '잘됐네요! 10만 개 이하 개당 $2.8, 10~20만 $2.5, 20만 이상 $2.2, 50만 이상은 특별 우대가 $1.9입니다.' },
      { speaker: 'A', speakerName: '대형바이어', chinese: '50万的$1.9还是偏高，我们希望能做到$1.7，并希望获得东南亚独家代理权。', pinyin: '50 wàn de $1.9 hái shì piān gāo, wǒmen xīwàng néng zuò dào $1.7, bìng xīwàng huòdé Dōngnányà dújiā dàilǐquán.', korean: '50만 개에 $1.9는 여전히 높습니다. $1.7까지 가능하고 동남아 독점 대리권을 원합니다.' },
      { speaker: 'B', speakerName: '제조업체', chinese: '独家代理权需要年采购量保证，$1.7在保证100万以上的前提下可以谈。', pinyin: 'Dújiā dàilǐquán xūyào nián cǎigòu liàng bǎozhèng, $1.7 zài bǎozhèng 100 wàn yǐshàng de qiántí xià kěyǐ tán.', korean: '독점 대리권은 연간 구매량 보증이 필요합니다. 100만 개 이상 보증 전제 하에 $1.7은 협의 가능합니다.' },
      { speaker: 'A', speakerName: '대형바이어', chinese: '100万太多，我们先承诺60万，价格$1.75，您看如何？', pinyin: '100 wàn tài duō, wǒmen xiān chéngnuò 60 wàn, jiàgé $1.75, nín kàn rúhé?', korean: '100만은 너무 많습니다. 우선 60만 개를 약속하고, 가격은 $1.75는 어떤가요?' },
      { speaker: 'B', speakerName: '제조업체', chinese: '60万、$1.75，外加我们提供免费打样和专属技术支持，这个方案我可以报请董事会批准。', pinyin: '60 wàn, $1.75, wàijiā wǒmen tígōng miǎnfèi dǎyàng hé zhuānshǔ jìshù zhīchí, zhège fāng\'àn wǒ kěyǐ bào qǐng dǒngshì huì pīzhǔn.', korean: '60만 개, $1.75, 그리고 저희가 무료 샘플링과 전담 기술 지원을 제공하는 조건으로 이사회 승인을 받아볼게요.' },
    ],
  },

  // ─── 납기·배송 ───
  {
    id: 'delivery-001',
    title: '确认交货期',
    titleKo: '납기 확인',
    category: '납기·배송',
    difficulty: '초급',
    keywords: ['납기', '배송', '선적', '생산기간'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '这批货什么时候可以交货？', pinyin: 'Zhè pī huò shénme shíhou kěyǐ jiāohuò?', korean: '이 물건은 언제 납품 가능한가요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '我们的生产周期一般是30天，加上海运时间大约45天后到达韩国。', pinyin: 'Wǒmen de shēngchǎn zhōuqī yībān shì 30 tiān, jiāshàng hǎiyùn shíjiān dàyuē 45 tiān hòu dàodá Hánguó.', korean: '저희 생산 주기는 보통 30일이며, 해상 운송 시간을 더하면 한국까지 약 45일 후 도착합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '45天太长了，我们最多等40天，能提前吗？', pinyin: '45 tiān tài cháng le, wǒmen zuìduō děng 40 tiān, néng tíqián ma?', korean: '45일은 너무 깁니다. 최대 40일을 기다릴 수 있는데, 앞당길 수 있나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '如果量不大，我们可以安排加急生产，25天完成生产，空运的话35天可以到。', pinyin: 'Rúguǒ liàng bù dà, wǒmen kěyǐ ānpái jiājí shēngchǎn, 25 tiān wánchéng shēngchǎn, kōngyùn de huà 35 tiān kěyǐ dào.', korean: '수량이 많지 않으면 긴급 생산을 배치할 수 있습니다. 25일 내 생산 완료, 항공편으로 35일 내 도착 가능합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '空运费用谁来承担？', pinyin: 'Kōngyùn fèiyòng shuí lái chéngdān?', korean: '항공 운임은 누가 부담하나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '如果是我们生产延误，我们承担运费差额。这次是您方急需，建议各承担一半。', pinyin: 'Rúguǒ shì wǒmen shēngchǎn yánwù, wǒmen chéngdān yùnfèi chā é. Zhè cì shì nín fāng jí xū, jiànyì gè chéngdān yī bàn.', korean: '저희 생산 지연이면 저희가 운임 차액을 부담합니다. 이번은 귀측이 급히 필요한 것이니 절반씩 부담할 것을 제안합니다.' },
    ],
  },
  {
    id: 'delivery-002',
    title: '分批发货安排',
    titleKo: '분할 선적 협의',
    category: '납기·배송',
    difficulty: '중급',
    keywords: ['분할선적', 'B/L', '선적서류', 'CIF'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '这批5000只的订单，能不能分两批发货？', pinyin: 'Zhè pī 5000 zhī de dìngdān, néng bu néng fēn liǎng pī fāhuò?', korean: '이 5,000개 주문을 두 번에 나눠서 발송할 수 있나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '可以，第一批2000只先出，15天后第二批3000只再发。', pinyin: 'Kěyǐ, dì yī pī 2000 zhī xiān chū, 15 tiān hòu dì èr pī 3000 zhī zài fā.', korean: '가능합니다. 1차분 2,000개를 먼저 출하하고, 15일 후 2차분 3,000개를 발송합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '每批都要单独的B/L和发票吗？', pinyin: 'Měi pī dōu yào dúlì de B/L hé fāpiào ma?', korean: '각 배치마다 별도의 B/L과 인보이스가 필요한가요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '是的，分批发货会有单独的提单和商业发票、装箱单。L/C的话需要提前确认允许分批装运条款。', pinyin: 'Shì de, fēn pī fāhuò huì yǒu dúlì de tídān hé shāngyè fāpiào, zhuāngxiāng dān. L/C de huà xūyào tíqián quèrèn yǔnxǔ fēn pī zhuāngyùn tiáokuǎn.', korean: '네, 분할 발송 시 별도의 선하증권, 상업인보이스, 패킹리스트가 있습니다. L/C의 경우 분할 선적 허용 조항을 미리 확인해야 합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '我们用T/T付款，所以不用担心L/C的问题。发货后几天提供提单副本？', pinyin: 'Wǒmen yòng T/T fùkuǎn, suǒyǐ bùyòng dānxīn L/C de wèntí. Fāhuò hòu jǐ tiān tígōng tídān fùběn?', korean: 'T/T 결제를 사용하므로 L/C 문제는 없습니다. 발송 후 며칠 내에 B/L 사본을 제공하나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '船开后3个工作日内，我们会发送全套单据的扫描件给您。', pinyin: 'Chuán kāi hòu 3 gè gōngzuò rì nèi, wǒmen huì fāsòng quán tào dānjù de sǎomiáo jiàn gěi nín.', korean: '선박 출항 후 3영업일 내에 전체 서류 스캔본을 보내드리겠습니다.' },
    ],
  },

  // ─── 품질·클레임 ───
  {
    id: 'quality-001',
    title: '质量问题反馈',
    titleKo: '품질 문제 피드백',
    category: '품질·클레임',
    difficulty: '중급',
    keywords: ['불량', '품질', '교환', 'AQL'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '上次收到的货物发现有5%的不良品，主要是驱动器故障，这怎么处理？', pinyin: 'Shàng cì shōudào de huòwù fāxiàn yǒu 5% de bùliángpǐn, zhǔyào shì qūdòngqì gùzhàng, zhè zěnme chǔlǐ?', korean: '지난번 받은 물건에서 5% 불량품이 발견됐습니다. 주로 드라이버 고장인데, 어떻게 처리하나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '非常抱歉！请您提供不良品的照片和检测报告，我们会尽快处理。', pinyin: 'Fēicháng bàoqiàn! Qǐng nín tígōng bùliángpǐn de zhàopiàn hé jiǎncè bàogào, wǒmen huì jǐnkuài chǔlǐ.', korean: '매우 죄송합니다! 불량품 사진과 검사 보고서를 제공해 주시면 최대한 빨리 처리하겠습니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '照片已经发到你们邮箱了，共50只不良品，希望能直接退款或补货。', pinyin: 'Zhàopiàn yǐjīng fā dào nǐmen yóuxiāng le, gòng 50 zhī bùliángpǐn, xīwàng néng zhíjiē tuìkuǎn huò bǔhuò.', korean: '사진은 이미 이메일로 보냈습니다. 총 50개 불량품이며, 직접 환불 또는 보충 공급을 원합니다.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '我们核查后确认是驱动器批次问题，愿意全额补发50只，运费我们承担。', pinyin: 'Wǒmen héchá hòu quèrèn shì qūdòngqì pīcì wèntí, yuànyì quán é bǔ fā 50 zhī, yùnfèi wǒmen chéngdān.', korean: '확인 결과 드라이버 배치 문제임을 확인했습니다. 50개를 전액 보충 발송하겠으며, 운임은 저희가 부담합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '好的，另外希望下次发货前能做第三方检测，AQL 2.5标准。', pinyin: 'Hǎo de, lìngwài xīwàng xià cì fāhuò qián néng zuò dìsān fāng jiǎncè, AQL 2.5 biāozhǔn.', korean: '알겠습니다. 추가로 다음 발송 전에 제3자 검사를 AQL 2.5 기준으로 진행해 주시길 바랍니다.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '没问题，我们会安排SGS检测，检测合格后再出货，费用双方各半。', pinyin: 'Méi wèntí, wǒmen huì ānpái SGS jiǎncè, jiǎncè hégé hòu zài chūhuò, fèiyòng shuāng fāng gè bàn.', korean: '문제없습니다. SGS 검사를 배치하고 합격 후 출고하겠습니다. 비용은 양측이 절반씩 부담합니다.' },
    ],
  },
  {
    id: 'quality-002',
    title: '工厂验货流程',
    titleKo: '공장 검수 절차',
    category: '품질·클레임',
    difficulty: '고급',
    keywords: ['공장검수', '샘플', '양산전검사', '검수기준'],
    lines: [
      { speaker: 'A', speakerName: '품질담당', chinese: '我们希望在大货出运前到工厂进行验货，你们方便安排吗？', pinyin: 'Wǒmen xīwàng zài dà huò chūyùn qián dào gōngchǎng jìnxíng yànhuò, nǐmen fāngbiàn ānpái ma?', korean: '대량 선적 전 공장 검수를 원합니다. 준비할 수 있나요?' },
      { speaker: 'B', speakerName: '공장담당', chinese: '当然可以，请提前3天通知，我们会安排专人配合验货工作。', pinyin: 'Dāngrán kěyǐ, qǐng tíqián 3 tiān tōngzhī, wǒmen huì ānpái zhuān rén pèihé yànhuò gōngzuò.', korean: '물론입니다. 3일 전에 통보해 주시면 전담자를 배치해 검수 작업에 협조하겠습니다.' },
      { speaker: 'A', speakerName: '품질담당', chinese: '验货时我们需要随机抽取100只进行全检，包括光效、光通量、色温、功率因数测试。', pinyin: 'Yànhuò shí wǒmen xūyào suíjī chōuqǔ 100 zhī jìnxíng quán jiǎn, bāokuò guāngxiào, guāngtōngliàng, sètōng, gōnglǜ yīnshù cèshì.', korean: '검수 시 100개를 무작위 추출해 광효율, 광속, 색온도, 역률 테스트를 포함한 전체 검사가 필요합니다.' },
      { speaker: 'B', speakerName: '공장담당', chinese: '我们的出厂检测已经包含这些项目，会提供完整的检测报告供您参考。', pinyin: 'Wǒmen de chūchǎng jiǎncè yǐjīng bāohán zhèxiē xiàngmù, huì tígōng wánzhěng de jiǎncè bàogào gōng nín cānkǎo.', korean: '저희 출하 검사에 이미 이 항목들이 포함되어 있으며, 참고용으로 완전한 검사 보고서를 제공하겠습니다.' },
      { speaker: 'A', speakerName: '품질담당', chinese: '如果抽检不良率超过2%，我们要求重新全检后才能出货。', pinyin: 'Rúguǒ chōujiǎn bùliánglǜ chāoguò 2%, wǒmen yāoqiú chóngxīn quán jiǎn hòu cái néng chūhuò.', korean: '샘플 검사에서 불량률이 2%를 초과하면 전체 재검사 후 출고를 요구합니다.' },
      { speaker: 'B', speakerName: '공장담당', chinese: '这个要求合理，我们完全接受，也希望通过这次合作建立长期质量标准。', pinyin: 'Zhège yāoqiú hélǐ, wǒmen wánquán jiēshòu, yě xīwàng tōngguò zhè cì hézuò jiànlì cháng qī zhìliàng biāozhǔn.', korean: '이 요구는 합리적입니다. 완전히 수용하며, 이번 협력을 통해 장기적인 품질 기준을 수립하길 바랍니다.' },
    ],
  },

  // ─── 결제·금융 ───
  {
    id: 'payment-001',
    title: 'T/T付款方式确认',
    titleKo: 'T/T 결제 방식 확인',
    category: '결제·금융',
    difficulty: '초급',
    keywords: ['T/T', '선금', '잔금', '결제조건'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '付款方式我们希望用T/T，能接受吗？', pinyin: 'Fùkuǎn fāngshì wǒmen xīwàng yòng T/T, néng jiēshòu ma?', korean: '결제 방식으로 T/T를 원하는데 가능한가요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '可以接受T/T，一般条件是30%定金，余款见提单复印件付清。', pinyin: 'Kěyǐ jiēshòu T/T, yībān tiáojiàn shì 30% dìngjīn, yú kuǎn jiàn tídān fùyìnjiàn fùqīng.', korean: 'T/T는 가능합니다. 일반적으로 30% 계약금, 잔금은 B/L 사본 확인 후 완납합니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '对于新供应商，我们通常是20%定金，80%见提单，可以吗？', pinyin: 'Duìyú xīn gōngyìngshāng, wǒmen tōngcháng shì 20% dìngjīn, 80% jiàn tídān, kěyǐ ma?', korean: '새 공급업체에 대해서는 보통 20% 계약금, 80%는 B/L 확인 후인데 괜찮나요?' },
      { speaker: 'B', speakerName: '공급업체', chinese: '20%定金对于新客户我们有些顾虑，能否30%？等我们合作稳定后再调整。', pinyin: '20% dìngjīn duìyú xīn kèhù wǒmen yǒuxiē gùlǜ, néng fǒu 30%? Děng wǒmen hézuò wěndìng hòu zài tiáozhěng.', korean: '신규 고객에게 20% 계약금은 좀 걱정됩니다. 30%로 해주시겠어요? 협력이 안정되면 조정하겠습니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '好吧，30%定金我们接受，但希望提单日起30天内付清余款。', pinyin: 'Hǎo ba, 30% dìngjīn wǒmen jiēshòu, dàn xīwàng tídān rì qǐ 30 tiān nèi fùqīng yú kuǎn.', korean: '그럼 30% 계약금을 받아들이겠습니다만, B/L 발행일로부터 30일 내에 잔금을 완납하길 원합니다.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '没问题，请将公司账户信息发给我，我们准备合同和银行账户信息。', pinyin: 'Méi wèntí, qǐng jiāng gōngsī zhànghù xìnxī fā gěi wǒ, wǒmen zhǔnbèi hétong hé yínháng zhànghù xìnxī.', korean: '문제없습니다. 회사 계좌 정보를 보내주시면, 저희도 계약서와 은행 계좌 정보를 준비하겠습니다.' },
    ],
  },
  {
    id: 'payment-002',
    title: '信用证操作流程',
    titleKo: 'L/C 작업 절차',
    category: '결제·금융',
    difficulty: '고급',
    keywords: ['L/C', '신용장', '서류', '조건'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '这批货金额较大，我们希望用不可撤销信用证方式付款。', pinyin: 'Zhè pī huò jīné jiào dà, wǒmen xīwàng yòng bùkě chèxiāo xìnyòngzhèng fāngshì fùkuǎn.', korean: '이번 물건은 금액이 크므로 취소불능 신용장 방식으로 결제하길 원합니다.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '可以，请确认信用证的主要条款：受益人名称、金额、装运期、交单期限。', pinyin: 'Kěyǐ, qǐng quèrèn xìnyòngzhèng de zhǔyào tiáokuǎn: shòuyì rén míngchēng, jīné, zhuāngyùn qī, jiāo dān qīxiàn.', korean: '가능합니다. 신용장의 주요 조항을 확인해 주세요: 수익자 명칭, 금액, 선적 기간, 서류 제출 기한.' },
      { speaker: 'A', speakerName: '바이어', chinese: '受益人是贵公司全称，金额USD 140,000，装运期45天，交单期21天，允许分批装运和转运。', pinyin: 'Shòuyì rén shì guì gōngsī quánchēng, jīné USD 140,000, zhuāngyùn qī 45 tiān, jiāo dān qī 21 tiān, yǔnxǔ fēn pī zhuāngyùn hé zhuǎnyùn.', korean: '수익자는 귀사 법인명, 금액 USD 140,000, 선적 기간 45일, 서류 제출 21일, 분할 선적 및 환적 허용.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '没问题，请发开证行信息，我们会核查L/C条款是否可操作，如有不符点会提前沟通。', pinyin: 'Méi wèntí, qǐng fā kāizhèng háng xìnxī, wǒmen huì héchá L/C tiáokuǎn shìfǒu kě cāozuò, rú yǒu bù fú diǎn huì tíqián gōutōng.', korean: '문제없습니다. 개설은행 정보를 보내주시면, L/C 조항의 실행 가능 여부를 확인하고 불일치 사항이 있으면 미리 소통하겠습니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '好的，单据要求包括：商业发票3份、装箱单3份、全套提单3份正本、原产地证书。', pinyin: 'Hǎo de, dānjù yāoqiú bāokuò: shāngyè fāpiào 3 fèn, zhuāngxiāng dān 3 fèn, quán tào tídān 3 fèn zhèngběn, yuán chǎn dì zhèngshū.', korean: '네, 서류 요건은: 상업인보이스 3부, 패킹리스트 3부, 전체 B/L 정본 3부, 원산지증명서.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '原产地证书需要中国制造（MIC），我们会通过中国国际贸易促进委员会申请。开证后请给我们3天时间审证。', pinyin: 'Yuán chǎn dì zhèngshū xūyào Zhōngguó zhìzào (MIC), wǒmen huì tōngguò Zhōngguó Guójì Màoyì Cùjìn Wěiyuánhuì shēnqǐng. Kāizhèng hòu qǐng gěi wǒmen 3 tiān shíjiān shěn zhèng.', korean: '원산지증명서는 중국산(MIC)이 필요하며, 중국국제무역촉진위원회를 통해 신청하겠습니다. 개설 후 3일간 신용장 검토 시간을 주세요.' },
    ],
  },

  // ─── 전시회·박람회 ───
  {
    id: 'fair-001',
    title: '广交会参展洽谈',
    titleKo: '광저우 박람회 상담',
    category: '전시회·박람회',
    difficulty: '초급',
    keywords: ['박람회', '광저우', '전시', '명함'],
    lines: [
      { speaker: 'A', speakerName: '방문객', chinese: '你好，我在广交会上看到你们的LED产品很感兴趣，能介绍一下吗？', pinyin: 'Nǐ hǎo, wǒ zài Guǎngjiāohuì shàng kàndào nǐmen de LED chǎnpǐn hěn gǎn xìngqù, néng jièshào yīxià ma?', korean: '안녕하세요, 광저우 박람회에서 귀사의 LED 제품이 마음에 들어 소개해 주시겠어요?' },
      { speaker: 'B', speakerName: '영업', chinese: '欢迎！这是我们的名片，我是销售经理李明。请问您是哪个国家的客户？', pinyin: 'Huānyíng! Zhè shì wǒmen de míngpiàn, wǒ shì xiāoshòu jīnglǐ Lǐ Míng. Qǐngwèn nín shì nǎge guójiā de kèhù?', korean: '환영합니다! 명함입니다, 저는 영업부장 이명입니다. 어느 나라 고객이신가요?' },
      { speaker: 'A', speakerName: '방문객', chinese: '我来自韩国，主要做工业照明进口业务，想找可靠的中国供应商。', pinyin: 'Wǒ lái zì Hánguó, zhǔyào zuò gōngyè zhàomíng jìnkǒu yèwù, xiǎng zhǎo kěkào de Zhōngguó gōngyìngshāng.', korean: '한국에서 왔으며 주로 산업용 조명 수입 업무를 합니다. 믿을 수 있는 중국 공급업체를 찾고 있습니다.' },
      { speaker: 'B', speakerName: '영업', chinese: '太好了！韩国市场对LED品质要求很高，我们正好专注高品质工业照明。请来坐，我给您详细介绍。', pinyin: 'Tài hǎo le! Hánguó shìchǎng duì LED pǐnzhì yāoqiú hěn gāo, wǒmen zhènghǎo zhuānzhù gāo pǐnzhì gōngyè zhàomíng. Qǐng lái zuò, wǒ gěi nín xiángxì jièshào.', korean: '잘됐네요! 한국 시장은 LED 품질 요구가 매우 높은데, 저희가 마침 고품질 산업조명에 특화되어 있습니다. 앉으세요, 자세히 소개해 드리겠습니다.' },
      { speaker: 'A', speakerName: '방문객', chinese: '你们有没有CE认证？韩국进口需要相关认证。', pinyin: 'Nǐmen yǒu méiyǒu CE rènzhèng? Hánguó jìnkǒu xūyào xiāngguān rènzhèng.', korean: 'CE 인증이 있나요? 한국 수입에는 관련 인증이 필요합니다.' },
      { speaker: 'B', speakerName: '영업', chinese: '我们有CE、RoHS、EMC认证，另外也有KC认证，专门针对韩国市场，资料可以现在给您。', pinyin: 'Wǒmen yǒu CE, RoHS, EMC rènzhèng, lìngwài yě yǒu KC rènzhèng, zhuānmén zhēnduì Hánguó shìchǎng, zīliào kěyǐ xiànzài gěi nín.', korean: 'CE, RoHS, EMC 인증이 있으며, 한국 시장을 위한 KC 인증도 있습니다. 자료를 지금 드릴 수 있습니다.' },
    ],
  },
  {
    id: 'fair-002',
    title: '展会后跟进',
    titleKo: '전시회 후 후속 연락',
    category: '전시회·박람회',
    difficulty: '중급',
    keywords: ['후속연락', '샘플요청', '견적서', '미팅'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '您好，我是上次广交会上与您交谈的韩国客户金先生。', pinyin: 'Nín hǎo, wǒ shì shàng cì Guǎngjiāohuì shàng yǔ nín jiāotán de Hánguó kèhù Jīn xiānsheng.', korean: '안녕하세요, 지난 광저우 박람회에서 대화를 나눈 한국 고객 김 씨입니다.' },
      { speaker: 'B', speakerName: '영업', chinese: '金先生您好！很高兴您联系我们，展会后我一直期待您的消息。', pinyin: 'Jīn xiānsheng nín hǎo! Hěn gāoxìng nín liánxì wǒmen, zhǎnhuì hòu wǒ yīzhí qīdài nín de xiāoxi.', korean: '김 씨, 안녕하세요! 연락 주셔서 반갑습니다. 전시회 이후로 쭉 연락을 기다리고 있었습니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '我们对100W和150W的工矿灯很感兴趣，能先寄样品过来吗？', pinyin: 'Wǒmen duì 100W hé 150W de gōngkuàng dēng hěn gǎn xìngqù, néng xiān jì yàngpǐn guòlái ma?', korean: '100W와 150W 산업등에 관심이 많습니다. 먼저 샘플을 보내주실 수 있나요?' },
      { speaker: 'B', speakerName: '영업', chinese: '当然！样品费每只100美元，正式下单后可以抵扣。快递费到付，约3-5天到韩国。', pinyin: 'Dāngrán! Yàngpǐn fèi měi zhī 100 Měiyuán, zhèngshì xià dān hòu kěyǐ dǐkòu. Kuàidì fèi dào fù, yuē 3-5 tiān dào Hánguó.', korean: '물론이죠! 샘플 비용은 개당 100달러이며, 정식 주문 시 차감 가능합니다. 운임은 착불로 한국까지 3~5일 소요됩니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '好的，每款各要一个样品，另外请发正式报价单给我。', pinyin: 'Hǎo de, měi kuǎn gè yào yī gè yàngpǐn, lìngwài qǐng fā zhèngshì bàojià dān gěi wǒ.', korean: '네, 각 제품별로 샘플 1개씩 원하며, 공식 견적서도 보내주세요.' },
      { speaker: 'B', speakerName: '영업', chinese: '好的，报价单和样品寄出通知今天内发您，希望样品测试顺利，期待正式合作！', pinyin: 'Hǎo de, bàojià dān hé yàngpǐn jìchū tōngzhī jīntiān nèi fā nín, xīwàng yàngpǐn cèshì shùnlì, qīdài zhèngshì hézuò!', korean: '네, 견적서와 샘플 발송 통보를 오늘 내로 보내드리겠습니다. 샘플 테스트가 잘 되길 바라며, 정식 협력을 기대합니다!' },
    ],
  },

  // ─── 일상인사 ───
  {
    id: 'daily-001',
    title: '日常问候与寒暄',
    titleKo: '일상 인사와 안부',
    category: '일상인사',
    difficulty: '초급',
    keywords: ['인사', '안부', '날씨', '안녕'],
    lines: [
      { speaker: 'A', speakerName: '동료A', chinese: '早上好！今天天气怎么样？', pinyin: 'Zǎoshang hǎo! Jīntiān tiānqì zěnmeyàng?', korean: '좋은 아침이에요! 오늘 날씨 어때요?' },
      { speaker: 'B', speakerName: '동료B', chinese: '早！今天阳光很好，不冷不热，很舒服。你昨天休息得怎么样？', pinyin: 'Zǎo! Jīntiān yángguāng hěn hǎo, bù lěng bù rè, hěn shūfu. Nǐ zuótiān xiūxi de zěnmeyàng?', korean: '안녕! 오늘 햇빛이 좋아요, 춥지도 덥지도 않아서 매우 쾌적해요. 어제 잘 쉬었어요?' },
      { speaker: 'A', speakerName: '동료A', chinese: '还好，昨晚和家人一起吃了顿大餐，吃得很开心。', pinyin: 'Hái hǎo, zuówǎn hé jiārén yīqǐ chīle dùn dà cān, chī de hěn kāixīn.', korean: '그럭저럭이요, 어제 저녁 가족과 함께 맛있는 식사를 해서 즐거웠어요.' },
      { speaker: 'B', speakerName: '동료B', chinese: '真好！上周末我出去爬山了，累但是很充实。', pinyin: 'Zhēn hǎo! Shàng zhōumò wǒ chūqù páshān le, lèi dànshì hěn chōngshí.', korean: '정말 좋네요! 지난 주말에 등산을 갔는데, 피곤했지만 충실했어요.' },
      { speaker: 'A', speakerName: '동료A', chinese: '最近工作忙吗？看你每天都很晚才离开公司。', pinyin: 'Zuìjìn gōngzuò máng ma? Kàn nǐ měitiān dōu hěn wǎn cái líkāi gōngsī.', korean: '요즘 일이 바쁜가요? 매일 늦게 퇴근하시던데.' },
      { speaker: 'B', speakerName: '동료B', chinese: '是挺忙的，下个月有个大项目，现在在准备阶段，忙完就好了。', pinyin: 'Shì tǐng máng de, xià gè yuè yǒu gè dà xiàngmù, xiànzài zài zhǔnbèi jiēduàn, máng wán jiù hǎo le.', korean: '꽤 바쁘네요. 다음 달에 큰 프로젝트가 있어서 지금 준비 단계라, 끝나면 좋아질 거예요.' },
    ],
  },
  {
    id: 'daily-002',
    title: '自我介绍',
    titleKo: '자기소개',
    category: '일상인사',
    difficulty: '초급',
    keywords: ['자기소개', '이름', '직업', '출신'],
    lines: [
      { speaker: 'A', speakerName: '김현', chinese: '大家好，我来自韩国，叫金贤，在首尔一家LED照明公司工作。', pinyin: "Dàjiā hǎo, wǒ lái zì Hánguó, jiào Jīn Xiàn, zài Shǒu'ěr yījiā LED zhàomíng gōngsī gōngzuò.", korean: '안녕하세요, 저는 한국에서 온 김현입니다. 서울의 한 LED조명 회사에서 일합니다.' },
      { speaker: 'B', speakerName: '리웨이', chinese: '你好，金贤，我叫李伟，是广州人，在这里做外贸业务。很高兴认识你！', pinyin: 'Nǐ hǎo, Jīn Xiàn, wǒ jiào Lǐ Wěi, shì Guǎngzhōu rén, zài zhèlǐ zuò wàimào yèwù. Hěn gāoxìng rènshi nǐ!', korean: '안녕하세요, 김현씨. 저는 이위이고 광저우 사람입니다. 여기서 무역 업무를 합니다. 만나서 반갑습니다!' },
      { speaker: 'A', speakerName: '김현', chinese: '你的普通话说得很好，我正在学习中文，还需要多练习。', pinyin: 'Nǐ de pǔtōnghuà shuō de hěn hǎo, wǒ zhèngzài xuéxí zhōngwén, hái xūyào duō liànxí.', korean: '중국어를 정말 잘 하시네요. 저는 중국어를 배우고 있는데 아직 많이 연습해야 해요.' },
      { speaker: 'B', speakerName: '리웨이', chinese: '你已经说得不错了！学语言要多说多听，不要怕犯错误。', pinyin: 'Nǐ yǐjīng shuō de bùcuò le! Xué yǔyán yào duō shuō duō tīng, bùyào pà fàn cuòwù.', korean: '이미 잘 하고 계세요! 언어는 많이 말하고 많이 들어야 해요. 실수를 두려워하지 마세요.' },
      { speaker: 'A', speakerName: '김현', chinese: '谢谢鼓励！我希望能流利地和中国客户沟通，对我们的业务很重要。', pinyin: 'Xièxie gǔlì! Wǒ xīwàng néng liúlì de hé Zhōngguó kèhù gōutōng, duì wǒmen de yèwù hěn zhòngyào.', korean: '격려 감사합니다! 중국 고객과 유창하게 소통할 수 있길 바랍니다. 저희 비즈니스에 매우 중요하거든요.' },
    ],
  },

  // ─── 식사·접대 ───
  {
    id: 'dinner-001',
    title: '商务宴请',
    titleKo: '비즈니스 식사 접대',
    category: '식사·접대',
    difficulty: '초급',
    keywords: ['식사', '건배', '요리주문', '접대'],
    lines: [
      { speaker: 'A', speakerName: '호스트', chinese: '欢迎您来广州！今晚我们去尝尝正宗粤菜，您有什么忌口吗？', pinyin: 'Huānyíng nín lái Guǎngzhōu! Jīnwǎn wǒmen qù cháng cháng zhèngzōng Yuècài, nín yǒu shénme jì kǒu ma?', korean: '광저우 오신 것을 환영합니다! 오늘 저녁 정통 광동 요리를 맛보러 가는데, 못 드시는 것 있나요?' },
      { speaker: 'B', speakerName: '게스트', chinese: '我不吃猪肉，其他都可以。韩国人来中国一定要尝尝当地美食。', pinyin: 'Wǒ bù chī zhūròu, qítā dōu kěyǐ. Hánguó rén lái Zhōngguó yīdìng yào cháng cháng dāngdì měishí.', korean: '돼지고기는 안 먹고, 나머지는 다 됩니다. 한국 사람이 중국에 오면 꼭 현지 음식을 맛봐야죠.' },
      { speaker: 'A', speakerName: '호스트', chinese: '放心！今晚安排了白切鸡、清蒸鱼、白灼虾，都是粤菜经典。来，先喝茶！', pinyin: 'Fàngxīn! Jīnwǎn ānpái le báiqiē jī, qīngzhēng yú, báizhuó xiā, dōu shì Yuècài jīngdiǎn. Lái, xiān hē chá!', korean: '걱정 마세요! 오늘 저녁은 백절계, 청증어, 백작하를 준비했습니다. 모두 광동 요리의 클래식이에요. 자, 먼저 차 한 잔 하세요!' },
      { speaker: 'B', speakerName: '게스트', chinese: '感谢款待！为我们的合作干杯！', pinyin: 'Gǎnxiè kuǎndài! Wèi wǒmen de hézuò gānbēi!', korean: '대접해 주셔서 감사합니다! 저희 협력을 위해 건배!' },
      { speaker: 'A', speakerName: '호스트', chinese: '干杯！希望我们的合作越来越好，生意兴隆！', pinyin: 'Gānbēi! Xīwàng wǒmen de hézuò yuèláiyuè hǎo, shēngyì xīnglóng!', korean: '건배! 저희 협력이 점점 더 좋아지길, 사업 번창하시길 바랍니다!' },
      { speaker: 'B', speakerName: '게스트', chinese: '这条鱼做得太好了！是什么做法？', pinyin: 'Zhè tiáo yú zuò de tài hǎo le! Shì shénme zuòfǎ?', korean: '이 생선 정말 맛있네요! 어떤 조리법인가요?' },
      { speaker: 'A', speakerName: '호스트', chinese: '清蒸，最大程度保留鱼的鲜味，这是粤菜最基本的技巧。', pinyin: 'Qīngzhēng, zuìdà chéngdù bǎoliú yú de xiānwèi, zhè shì Yuècài zuì jīběn de jìqiǎo.', korean: '찜이에요. 생선의 신선한 맛을 최대한 보존하는 것이 광동 요리의 기본 기술입니다.' },
    ],
  },

  // ─── 회의 ───
  {
    id: 'meeting-001',
    title: '商务会议开幕',
    titleKo: '비즈니스 회의 시작',
    category: '회의',
    difficulty: '중급',
    keywords: ['회의', '아젠다', '참석자', '목표'],
    lines: [
      { speaker: 'A', speakerName: '사회자', chinese: '各位好，今天的会议正式开始，主要议题是Q3采购计划和价格谈判。', pinyin: 'Gèwèi hǎo, jīntiān de huìyì zhèngshì kāishǐ, zhǔyào yìtí shì Q3 cǎigòu jìhuà hé jiàgé tánpàn.', korean: '여러분 안녕하세요, 오늘 회의를 시작하겠습니다. 주요 의제는 Q3 구매 계획과 가격 협상입니다.' },
      { speaker: 'B', speakerName: '참석자', chinese: '请问今天参会的都有哪些部门？', pinyin: 'Qǐngwèn jīntiān cān huì de dōu yǒu nǎxiē bùmén?', korean: '오늘 참석 부서가 어디어디인가요?' },
      { speaker: 'A', speakerName: '사회자', chinese: '有采购部、财务部、技术部以及我方销售团队，共12人参会。', pinyin: 'Yǒu cǎigòu bù, cáiwù bù, jìshù bù yǐjí wǒ fāng xiāoshòu tuánduì, gòng 12 rén cān huì.', korean: '구매부, 재무부, 기술부와 저희 측 영업팀이 참석합니다. 총 12명입니다.' },
      { speaker: 'B', speakerName: '참석자', chinese: '今天的会议预计进行多长时间？', pinyin: 'Jīntiān de huìyì yùjì jìnxíng duō cháng shíjiān?', korean: '오늘 회의는 얼마나 진행될 예정인가요?' },
      { speaker: 'A', speakerName: '사회자', chinese: '计划两个小时，中间有10分钟休息。首先请采购部介绍Q3需求。', pinyin: 'Jìhuà liǎng gè xiǎoshí, zhōngjiān yǒu 10 fēnzhōng xiūxi. Shǒuxiān qǐng cǎigòu bù jièshào Q3 xūqiú.', korean: '2시간 예정이며 중간에 10분 휴식이 있습니다. 먼저 구매부에서 Q3 수요를 소개해 주세요.' },
      { speaker: 'B', speakerName: '구매담당', chinese: '好的，根据销售预测，Q3我们需要LED工矿灯约8000只，其中100W占60%，150W占40%。', pinyin: 'Hǎo de, gēnjù xiāoshòu yùcè, Q3 wǒmen xūyào LED gōngkuàng dēng yuē 8000 zhī, qízhōng 100W zhàn 60%, 150W zhàn 40%.', korean: '네, 판매 예측에 따르면 Q3에 LED 산업등 약 8,000개가 필요합니다. 그중 100W 60%, 150W 40%입니다.' },
    ],
  },

  // ─── 이메일·소통 ───
  {
    id: 'email-001',
    title: '商务邮件沟通',
    titleKo: '비즈니스 이메일 소통',
    category: '이메일·소통',
    difficulty: '중급',
    keywords: ['이메일', '첨부파일', '확인요청', '회신'],
    lines: [
      { speaker: 'A', speakerName: '발신자', chinese: '您好，附件是我方关于合同条款的修改意见，请您审阅后回复。', pinyin: 'Nín hǎo, fùjiàn shì wǒ fāng guānyú hétong tiáokuǎn de xiūgǎi yìjiàn, qǐng nín shěnyuè hòu huífù.', korean: '안녕하세요, 첨부는 계약 조항에 대한 저희 측 수정 의견입니다. 검토 후 회신 부탁드립니다.' },
      { speaker: 'B', speakerName: '수신자', chinese: '好的，我收到了，会在两个工作日内给您回复。如有问题我会电话联系。', pinyin: 'Hǎo de, wǒ shōudào le, huì zài liǎng gè gōngzuò rì nèi gěi nín huífù. Rú yǒu wèntí wǒ huì diànhuà liánxì.', korean: '네, 받았습니다. 2영업일 내로 회신드리겠습니다. 문제가 있으면 전화 연락드리겠습니다.' },
      { speaker: 'A', speakerName: '발신자', chinese: '谢谢，特别注意第5条款关于违约金的部分，这是我方的底线。', pinyin: 'Xièxie, tèbié zhùyì dì 5 tiáokuǎn guānyú wéiyuē jīn de bùfen, zhè shì wǒ fāng de dǐxiàn.', korean: '감사합니다. 특히 5조항 위약금 부분을 주목해 주세요. 이것이 저희 측의 마지노선입니다.' },
      { speaker: 'B', speakerName: '수신자', chinese: '明白，我方法务团队也会重点审查这部分，争取尽快达成一致。', pinyin: 'Míngbai, wǒ fāng fǎwù tuánduì yě huì zhòngdiǎn shěnchá zhè bùfen, zhēngqǔ jǐnkuài dáchéng yīzhì.', korean: '알겠습니다. 저희 법무팀도 이 부분을 중점 검토하겠습니다. 최대한 빨리 합의에 이르도록 노력하겠습니다.' },
      { speaker: 'A', speakerName: '발신자', chinese: '期待您的回复，如果本周五前能确定，我们下周就可以安排签约。', pinyin: 'Qīdài nín de huífù, rúguǒ běn zhōu wǔ qián néng quèdìng, wǒmen xià zhōu jiù kěyǐ ānpái qiānyuē.', korean: '회신 기대합니다. 이번 주 금요일 전에 확정되면 다음 주에 계약 서명을 배치할 수 있습니다.' },
    ],
  },

  // ─── 계약·법무 ───
  {
    id: 'contract-001',
    title: '合同签署流程',
    titleKo: '계약서 서명 절차',
    category: '계약·법무',
    difficulty: '고급',
    keywords: ['계약서', '서명', '조항', '법적효력'],
    lines: [
      { speaker: 'A', speakerName: '법무담당', chinese: '合同草案已经准备好，双方确认无误后可以签字。', pinyin: 'Hétong cǎo àn yǐjīng zhǔnbèi hǎo, shuāng fāng quèrèn wúwù hòu kěyǐ qiānzì.', korean: '계약서 초안이 준비됐습니다. 양측이 확인 후 서명할 수 있습니다.' },
      { speaker: 'B', speakerName: '상대방', chinese: '第三条产品规格标准，我方希望加入"不低于国际标准"的表述。', pinyin: 'Dì sān tiáo chǎnpǐn guīgé biāozhǔn, wǒ fāng xīwàng jiārù "bù dī yú guójì biāozhǔn" de biǎoshù.', korean: '3조 제품 사양 기준에 "국제 기준 이상"이라는 표현을 추가하길 원합니다.' },
      { speaker: 'A', speakerName: '법무담당', chinese: '可以，我们将修改为"符合并不低于IEC国际标准"，这样更具体。', pinyin: 'Kěyǐ, wǒmen jiāng xiūgǎi wéi "fúhé bìng bù dī yú IEC guójì biāozhǔn", zhèyàng gèng jùtǐ.', korean: '가능합니다. "IEC 국제 기준을 충족하고 그 이상"으로 수정하겠습니다. 이게 더 구체적입니다.' },
      { speaker: 'B', speakerName: '상대방', chinese: '同意，另外违约金比例希望从10%改为15%，以加强约束力。', pinyin: 'Tóngyì, lìngwài wéiyuē jīn bǐlì xīwàng cóng 10% gǎi wéi 15%, yǐ jiāqiáng yuēshùlì.', korean: '동의합니다. 추가로 위약금 비율을 10%에서 15%로 변경해 구속력을 강화하길 원합니다.' },
      { speaker: 'A', speakerName: '법무담당', chinese: '这个我方可以接受。合同适用法律建议保持中国法，争议解决选择深圳仲裁委员会。', pinyin: 'Zhège wǒ fāng kěyǐ jiēshòu. Hétong shìyòng fǎlǜ jiànyì bǎochí Zhōngguó fǎ, zhēngyì jiějué xuǎnzé Shēnzhèn zhòngcái wěiyuánhuì.', korean: '저희 측에서 수용 가능합니다. 준거법은 중국법으로 유지하고, 분쟁 해결은 선전 중재위원회를 선택하길 권합니다.' },
      { speaker: 'B', speakerName: '상대방', chinese: '仲裁地选择香港是否可以？对于国际争议更中立。', pinyin: 'Zhòngcái dì xuǎnzé Xiānggǎng shìfǒu kěyǐ? Duìyú guójì zhēngyì gèng zhōnglì.', korean: '중재지를 홍콩으로 하는 건 어떤가요? 국제 분쟁에 더 중립적입니다.' },
      { speaker: 'A', speakerName: '법무담당', chinese: '香港国际仲裁中心我方接受，这样对双方都比较公平。修改后明天发终版给您确认。', pinyin: 'Xiānggǎng Guójì Zhòngcái Zhōngxīn wǒ fāng jiēshòu, zhèyàng duì shuāng fāng dōu bǐjiào gōngpíng. Xiūgǎi hòu míngtiān fā zhōng bǎn gěi nín quèrèn.', korean: '홍콩 국제중재센터는 저희도 수용합니다. 양측 모두에게 공평합니다. 수정 후 내일 최종본을 확인용으로 보내드리겠습니다.' },
    ],
  },

  // ─── 공장방문 ───
  {
    id: 'factory-001',
    title: '工厂参观接待',
    titleKo: '공장 방문 접대',
    category: '공장방문',
    difficulty: '중급',
    keywords: ['공장견학', '생산라인', '설비', '용량'],
    lines: [
      { speaker: 'A', speakerName: '공장담당', chinese: '欢迎参观我们的生产基地！我先给您介绍一下工厂整体规模。', pinyin: 'Huānyíng cānguān wǒmen de shēngchǎn jīdì! Wǒ xiān gěi nín jièshào yīxià gōngchǎng zhěngtǐ guīmó.', korean: '저희 생산 기지 방문을 환영합니다! 먼저 공장 전체 규모를 소개해 드리겠습니다.' },
      { speaker: 'B', speakerName: '바이어', chinese: '好的，工厂总面积有多大？员工有多少人？', pinyin: 'Hǎo de, gōngchǎng zǒng miànjī yǒu duō dà? Yuángōng yǒu duōshǎo rén?', korean: '네, 공장 총 면적은 얼마나 되나요? 직원은 몇 명인가요?' },
      { speaker: 'A', speakerName: '공장담당', chinese: '总面积15000平方米，员工450名，其中技术人员80名，日产能5000只LED灯。', pinyin: 'Zǒng miànjī 15000 pínfāng mǐ, yuángōng 450 míng, qízhōng jìshù rényuán 80 míng, rì chǎnnéng 5000 zhī LED dēng.', korean: '총 면적 15,000㎡, 직원 450명이며 그중 기술 인력 80명, 일일 생산 능력 5,000개 LED등입니다.' },
      { speaker: 'B', speakerName: '바이어', chinese: '生产线是自动化的吗？', pinyin: 'Shēngchǎn xiàn shì zìdònghuà de ma?', korean: '생산 라인은 자동화인가요?' },
      { speaker: 'A', speakerName: '공장담당', chinese: '主要工序90%自动化，包括SMT贴片、焊接、老化测试都是全自动。只有最后包装是半自动。', pinyin: 'Zhǔyào gōngxù 90% zìdònghuà, bāokuò SMT tiē piàn, hàn jiē, lǎohuà cèshì dōu shì quán zìdòng. Zhǐ yǒu zuìhòu bāozhuāng shì bàn zìdòng.', korean: '주요 공정의 90%가 자동화되어 있습니다. SMT, 용접, 에이징 테스트 모두 전자동입니다. 최종 포장만 반자동입니다.' },
      { speaker: 'B', speakerName: '바이어', chinese: '老化测试做多长时间？', pinyin: 'Lǎohuà cèshì zuò duō cháng shíjiān?', korean: '에이징 테스트는 얼마나 하나요?' },
      { speaker: 'A', speakerName: '공장담당', chinese: '标准24小时老化测试，客户要求可以做到72小时，这个不会影响交期。', pinyin: 'Biāozhǔn 24 xiǎoshí lǎohuà cèshì, kèhù yāoqiú kěyǐ zuò dào 72 xiǎoshí, zhège bù huì yǐngxiǎng jiāoqī.', korean: '표준 24시간 에이징 테스트이며, 고객 요청 시 72시간까지 가능합니다. 납기에는 영향이 없습니다.' },
    ],
  },

  // ─── 파트너십 ───
  {
    id: 'partner-001',
    title: '建立战略合作关系',
    titleKo: '전략적 파트너십 구축',
    category: '파트너십',
    difficulty: '고급',
    keywords: ['파트너십', '전략', '장기협력', '공동개발'],
    lines: [
      { speaker: 'A', speakerName: '대표A', chinese: '合作两年来，双方的信任已经建立，我们希望升级到战略合作伙伴关系。', pinyin: 'Hézuò liǎng nián lái, shuāng fāng de xìnrèn yǐjīng jiànlì, wǒmen xīwàng shēngjí dào zhànlüè hézuò huǒbàn guānxi.', korean: '2년간의 협력으로 양측의 신뢰가 쌓였습니다. 전략적 파트너십으로 업그레이드하길 원합니다.' },
      { speaker: 'B', speakerName: '대표B', chinese: '我们也有同样的想法，具体来说，战略合作包含哪些内容？', pinyin: 'Wǒmen yě yǒu tóngyàng de xiǎngfǎ, jùtǐ lái shuō, zhànlüè hézuò bāohán nǎxiē nèiróng?', korean: '저희도 같은 생각입니다. 구체적으로 전략적 협력에는 어떤 내용이 포함되나요?' },
      { speaker: 'A', speakerName: '대표A', chinese: '我们希望共同开发新产品，共享研发成本，同时给予贵方更优惠的价格保障和优先供货权。', pinyin: 'Wǒmen xīwàng gòngtóng kāifā xīn chǎnpǐn, gòngxiǎng yánfā chéngběn, tóngshí gěiyǔ guì fāng gèng yōuhuì de jiàgé bǎozhàng hé yōuxiān gōnghuò quán.', korean: '신제품 공동 개발, R&D 비용 공유, 그리고 귀측에 더 우대된 가격 보장과 우선 공급권을 드리고 싶습니다.' },
      { speaker: 'B', speakerName: '대표B', chinese: '共同研发这个方向很好！我们可以投入技术团队参与，贵方负责市场调研和商务推广。', pinyin: 'Gòngtóng yánfā zhège fāngxiàng hěn hǎo! Wǒmen kěyǐ tóurù jìshù tuánduì cānyù, guì fāng fùzé shìchǎng diàoyán hé shāngwù tuīguǎng.', korean: '공동 R&D 방향은 좋네요! 저희는 기술팀을 투입하고, 귀측은 시장 조사와 비즈니스 홍보를 담당할 수 있습니다.' },
      { speaker: 'A', speakerName: '대표A', chinese: '完全同意！建议我们签署战略合作备忘录，明确各自责任和利益分配，三年为合作周期。', pinyin: 'Wánquán tóngyì! Jiànyì wǒmen qiānshǔ zhànlüè hézuò bèiwànglù, míngquè gèzì zérèn hé lìyì fēnpèi, sān nián wéi hézuò zhōuqī.', korean: '완전히 동의합니다! 전략적 협력 MOU를 체결하여 각자 책임과 이익 배분을 명확히 하고, 3년을 협력 주기로 하길 제안합니다.' },
      { speaker: 'B', speakerName: '대표B', chinese: '好！让我们的法务部门分别起草，下个月会面时正式签署，开启新阶段的合作！', pinyin: 'Hǎo! Ràng wǒmen de fǎwù bùmén fēnbié qǐcǎo, xià gè yuè huìmiàn shí zhèngshì qiānshǔ, kāiqǐ xīn jiēduàn de hézuò!', korean: '좋습니다! 각자 법무부서에서 초안을 작성하여 다음 달 만날 때 공식 서명하고 새로운 단계의 협력을 시작합시다!' },
    ],
  },

  // ─── 기술·제품 ───
  {
    id: 'tech-001',
    title: 'LED技术参数说明',
    titleKo: 'LED 기술 파라미터 설명',
    category: '기술·제품',
    difficulty: '중급',
    keywords: ['광속', '색온도', '연색지수', '효율'],
    lines: [
      { speaker: 'A', speakerName: '기술담당', chinese: '我来解释一下这款产品的主要技术参数。', pinyin: 'Wǒ lái jiěshì yīxià zhè kuǎn chǎnpǐn de zhǔyào jìshù cānshù.', korean: '이 제품의 주요 기술 파라미터를 설명해 드리겠습니다.' },
      { speaker: 'B', speakerName: '바이어', chinese: '好的，主要想了解光效和显色指数。', pinyin: 'Hǎo de, zhǔyào xiǎng liǎojiě guāngxiào hé xiǎnsè zhǐshù.', korean: '네, 주로 광효율과 연색지수를 알고 싶습니다.' },
      { speaker: 'A', speakerName: '기술담당', chinese: '光效160lm/W，在同类产品中属于高效级别。显色指数Ra≥90，接近自然光。', pinyin: 'Guāngxiào 160lm/W, zài tónglèi chǎnpǐn zhōng shǔyú gāoxiào jíbié. Xiǎnsè zhǐshù Ra ≥90, jiējìn zìrán guāng.', korean: '광효율 160lm/W는 동종 제품 중 고효율 등급입니다. 연색지수 Ra≥90으로 자연광에 가깝습니다.' },
      { speaker: 'B', speakerName: '바이어', chinese: '功率因数呢？对于我们的电网环境很重要。', pinyin: 'Gōnglǜ yīnshù ne? Duìyú wǒmen de diànwǎng huánjìng hěn zhòngyào.', korean: '역률은요? 저희 전력망 환경에서 매우 중요합니다.' },
      { speaker: 'A', speakerName: '기술담당', chinese: '功率因数PF≥0.95，谐波畸变率THD<10%，完全满足工业电网标准。', pinyin: 'Gōnglǜ yīnshù PF≥0.95, xiébo jī biàn lǜ THD<10%, wánquán mǎnzú gōngyè diànwǎng biāozhǔn.', korean: '역률 PF≥0.95, 고조파 왜곡률 THD<10%로 산업 전력망 기준을 완전히 충족합니다.' },
      { speaker: 'B', speakerName: '바이어', chinese: '使用寿命怎么样？', pinyin: 'Shǐyòng shòumìng zěnmeyàng?', korean: '사용 수명은 어떤가요?' },
      { speaker: 'A', speakerName: '기술담당', chinese: 'L70寿命50000小时，就是说50000小时后光通量仍保持初始值的70%以上。', pinyin: 'L70 shòumìng 50000 xiǎoshí, jiù shì shuō 50000 xiǎoshí hòu guāngtōngliàng réng bǎochí chūshǐ zhí de 70% yǐshàng.', korean: 'L70 수명 50,000시간입니다. 즉 50,000시간 후에도 광속이 초기값의 70% 이상을 유지합니다.' },
    ],
  },

  // ─── 클레임처리 ───
  {
    id: 'claim-001',
    title: '货物损坏索赔',
    titleKo: '화물 손상 배상 청구',
    category: '클레임처리',
    difficulty: '고급',
    keywords: ['손상', '배상', '보험', '책임'],
    lines: [
      { speaker: 'A', speakerName: '바이어', chinese: '收到货物后发现有30箱外包装严重损坏，内部产品也有损毁，需要赔偿！', pinyin: 'Shōudào huòwù hòu fāxiàn yǒu 30 xiāng wài bāozhuāng yánzhòng sǔnhuài, nèibù chǎnpǐn yě yǒu sǔnhuǐ, xūyào péicháng!', korean: '물건 수령 후 30박스가 외포장이 심하게 손상되었고 내부 제품도 파손됐습니다. 배상이 필요합니다!' },
      { speaker: 'B', speakerName: '공급업체', chinese: '非常遗憾！请您立即提供以下材料：收货照片、货损清单、公证报告，以便我们向保险公司申请理赔。', pinyin: 'Fēicháng yíhàn! Qǐng nín lìjí tígōng yǐxià cáiliào: shōuhuò zhàopiàn, huò sǔn qīngdān, gōngzhèng bàogào, yǐbiàn wǒmen xiàng bǎoxiǎn gōngsī shēnqǐng lǐpéi.', korean: '매우 유감입니다! 즉시 수령 사진, 피해 목록, 공증 보고서를 제공해 주시면 저희가 보험사에 보상을 신청하겠습니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '损坏的LED灯共180只，按进价计算损失约USD 4,500，我们要求全额赔偿。', pinyin: 'Sǔnhuài de LED dēng gòng 180 zhī, àn jìnjià jìsuàn sǔnshī yuē USD 4,500, wǒmen yāoqiú quán é péicháng.', korean: '손상된 LED등 총 180개, 매입가 기준 손실 약 USD 4,500입니다. 전액 배상을 요구합니다.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '这批货是CIF条款，货物离港后的损坏一般属于运输保险范畴，但我们愿意协助您向保险公司追索。', pinyin: 'Zhè pī huò shì CIF tiáokuǎn, huòwù lí gǎng hòu de sǔnhuài yībān shǔyú yùnshū bǎoxiǎn fànchóu, dàn wǒmen yuànyì xiézhù nín xiàng bǎoxiǎn gōngsī zhuīsuǒ.', korean: '이 물건은 CIF 조건으로, 출항 후 손상은 일반적으로 운송 보험 범주에 해당합니다. 하지만 보험사 청구에 협조하겠습니다.' },
      { speaker: 'A', speakerName: '바이어', chinese: '包装是贵方负责的，如果包装不符合运输标准，那责任在贵方。', pinyin: 'Bāozhuāng shì guì fāng fùzé de, rúguǒ bāozhuāng bù fúhé yùnshū biāozhǔn, nà zérèn zài guì fāng.', korean: '포장은 귀측 책임입니다. 포장이 운송 기준에 맞지 않으면 귀측의 책임입니다.' },
      { speaker: 'B', speakerName: '공급업체', chinese: '我们会立即调查包装记录，如确认是包装缺陷，我们承担全部责任并补发或退款，请您给我们3个工作日。', pinyin: 'Wǒmen huì lìjí diàochá bāozhuāng jìlù, rú quèrèn shì bāozhuāng quēxiàn, wǒmen chéngdān quánbù zérèn bìng bǔ fā huò tuìkuǎn, qǐng nín gěi wǒmen 3 gè gōngzuò rì.', korean: '즉시 포장 기록을 조사하겠습니다. 포장 결함이 확인되면 전적인 책임을 지고 보충 발송 또는 환불하겠습니다. 3영업일을 주세요.' },
    ],
  },

  // ─── 호텔·숙박 ───
  {
    id: 'hotel-001',
    title: '酒店入住与咨询',
    titleKo: '호텔 체크인 및 문의',
    category: '호텔·숙박',
    difficulty: '초급',
    keywords: ['호텔', '체크인', '예약', '시설'],
    lines: [
      { speaker: 'A', speakerName: '투숙객', chinese: '您好，我有预订，名字是Kim Hyun。', pinyin: 'Nín hǎo, wǒ yǒu yùdìng, míngzì shì Kim Hyun.', korean: '안녕하세요, 예약했습니다. 이름은 Kim Hyun입니다.' },
      { speaker: 'B', speakerName: '프론트', chinese: '请稍等，为您查询一下……是的，大床房两晚，从今天起。请出示您的护照。', pinyin: 'Qǐng shāo děng, wèi nín cháxún yīxià…… Shì de, dà chuáng fáng liǎng wǎn, cóng jīntiān qǐ. Qǐng chūshì nín de hùzhào.', korean: '잠깐 확인해 드리겠습니다…… 네, 더블룸 2박, 오늘부터입니다. 여권 보여주세요.' },
      { speaker: 'A', speakerName: '투숙객', chinese: '好的，这是我的护照。请问房间里有没有WiFi？', pinyin: 'Hǎo de, zhè shì wǒ de hùzhào. Qǐngwèn fángjiān lǐ yǒu méiyǒu WiFi?', korean: '네, 여권입니다. 방에 WiFi가 있나요?' },
      { speaker: 'B', speakerName: '프론트', chinese: '有的，免费WiFi，密码在房卡背面。早餐是7点到10点，在2楼餐厅。', pinyin: 'Yǒu de, miǎnfèi WiFi, mìmǎ zài fáng kǎ bèimiàn. Zǎocān shì 7 diǎn dào 10 diǎn, zài 2 lóu cāntīng.', korean: '무료 WiFi 있습니다. 비밀번호는 카드키 뒷면에 있습니다. 조식은 7시~10시, 2층 레스토랑입니다.' },
      { speaker: 'A', speakerName: '투숙객', chinese: '谢谢，房间可以提前退房吗？我明天下午有航班。', pinyin: 'Xièxie, fángjiān kěyǐ tíqián tuìfáng ma? Wǒ míngtiān xiàwǔ yǒu hángbān.', korean: '감사합니다. 조기 체크아웃이 가능한가요? 내일 오후 비행기가 있습니다.' },
      { speaker: 'B', speakerName: '프론트', chinese: '标准退房时间是中午12点，如需延迟退房到下午3点，需要加收半天房费。', pinyin: 'Biāozhǔn tuìfáng shíjiān shì zhōngwǔ 12 diǎn, rú xū yánchí tuìfáng dào xiàwǔ 3 diǎn, xūyào jiāshōu bàn tiān fánfèi.', korean: '표준 체크아웃은 정오 12시입니다. 오후 3시까지 연장하면 반일 객실 요금이 추가됩니다.' },
    ],
  },

  // ─── 교통·이동 ───
  {
    id: 'transport-001',
    title: '问路与打车',
    titleKo: '길 묻기와 택시',
    category: '교통·이동',
    difficulty: '초급',
    keywords: ['길묻기', '택시', '지하철', '방향'],
    lines: [
      { speaker: 'A', speakerName: '여행객', chinese: '请问，去广州火车站怎么走？', pinyin: 'Qǐngwèn, qù Guǎngzhōu huǒchē zhàn zěnme zǒu?', korean: '실례지만, 광저우 기차역에 어떻게 가나요?' },
      { speaker: 'B', speakerName: '현지인', chinese: '您可以坐地铁3号线，在体育西路换乘1号线，到广州火车站下，大概20分钟。', pinyin: 'Nín kěyǐ zuò dìtiě 3 hào xiàn, zài Tǐyù Xī Lù huànchéng 1 hào xiàn, dào Guǎngzhōu huǒchē zhàn xià, dàgài 20 fēnzhōng.', korean: '지하철 3호선을 타고 티유시루에서 1호선으로 환승해서 광저우 기차역에서 내리세요. 약 20분 걸립니다.' },
      { speaker: 'A', speakerName: '여행객', chinese: '地铁入口在哪里？', pinyin: 'Dìtiě rùkǒu zài nǎlǐ?', korean: '지하철 입구가 어디 있나요?' },
      { speaker: 'B', speakerName: '현지인', chinese: '就在前面那栋楼的右侧，看到蓝色地铁标志就是了。', pinyin: 'Jiù zài qiánmiàn nà dòng lóu de yòucè, kàndào lán sè dìtiě biāozhì jiù shì le.', korean: '저 앞 건물 오른쪽에 있습니다. 파란색 지하철 표지판이 보이면 됩니다.' },
      { speaker: 'A', speakerName: '여행객', chinese: '谢谢！如果我打车的话大概多少钱？', pinyin: 'Xièxie! Rúguǒ wǒ dǎchē de huà dàgài duōshǎo qián?', korean: '감사합니다! 택시를 탄다면 얼마나 하나요?' },
      { speaker: 'B', speakerName: '현지인', chinese: '打滴滴大概25-35元，比地铁贵一点但更方便，直接到门口。', pinyin: 'Dǎ Dīdī dàgài 25-35 yuán, bǐ dìtiě guì yīdiǎn dàn gèng fāngbiàn, zhíjiē dào ménkǒu.', korean: '디디추싱으로 약 25~35위안입니다. 지하철보다 비싸지만 편리하고 문 앞까지 가줍니다.' },
    ],
  },
];
