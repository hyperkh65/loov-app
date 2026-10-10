export interface GrammarPattern {
  title: string;
  pattern: string;
  structure: string;
  category: string;
  examples: Array<{ zh: string; pinyin: string; kr: string }>;
  notes?: string;
}

export const GRAMMAR_DB: GrammarPattern[] = [
  // ─── 기본 문장 구조 ───────────────────────────────────────────────
  { title:'주어+是+명사 (이다)', pattern:'我/我们 + 是 + [명사]', structure:'是는 영어 am/is/are에 해당. 부정은 不是', category:'기본구조',
    examples:[
      {zh:'我是韩国贸易商。',pinyin:'Wǒ shì Hánguó màoyìshāng.',kr:'저는 한국 무역상입니다.'},
      {zh:'这是我们的新产品。',pinyin:'Zhè shì wǒmen de xīn chǎnpǐn.',kr:'이것은 저희 신제품입니다.'},
      {zh:'他不是采购负责人。',pinyin:'Tā bú shì cǎigòu fùzérén.',kr:'그는 구매 담당자가 아닙니다.'},
    ]},
  { title:'주어+有+목적어 (있다/가지다)', pattern:'[주어] + 有 + [목적어]', structure:'有는 소유나 존재를 표현. 부정은 没有', category:'기본구조',
    examples:[
      {zh:'我们有现货。',pinyin:'Wǒmen yǒu xiànhuò.',kr:'저희 현재고 있습니다.'},
      {zh:'你们有KC认证吗？',pinyin:'Nǐmen yǒu KC rènzhèng ma?',kr:'KC 인증이 있습니까?'},
      {zh:'目前没有库存。',pinyin:'Mùqián méiyǒu kùcún.',kr:'현재 재고가 없습니다.'},
    ]},
  { title:'능원동사 能/可以 (할 수 있다)', pattern:'[주어] + 能/可以 + [동사구]', structure:'能: 능력/가능성, 可以: 허가/가능. 부정: 不能/不可以', category:'기본구조',
    examples:[
      {zh:'能否提前交货？',pinyin:'Néng fǒu tíqián jiāohuò?',kr:'납품을 앞당길 수 있습니까?'},
      {zh:'我们可以提供定制服务。',pinyin:'Wǒmen kěyǐ tígōng dìngzhì fúwù.',kr:'저희는 맞춤 서비스를 제공할 수 있습니다.'},
      {zh:'这个不能更改了。',pinyin:'Zhège bù néng gēnggǎi le.',kr:'이것은 더 이상 변경할 수 없습니다.'},
    ]},
  { title:'조건문: 如果…就… (만약~이면~)', pattern:'如果 + [조건] + 就 + [결과]', structure:'如果(만약)+就(그러면). 就는 생략 가능', category:'기본구조',
    examples:[
      {zh:'如果订量超过一千个，就可以给折扣。',pinyin:'Rúguǒ dìng liàng chāoguò yīqiān gè, jiù kěyǐ gěi zhékòu.',kr:'주문량이 1,000개를 초과하면 할인을 드릴 수 있습니다.'},
      {zh:'如果质量有问题，我们负责更换。',pinyin:'Rúguǒ zhìliàng yǒu wèntí, wǒmen fùzé gēnghuàn.',kr:'품질 문제가 있으면 저희가 교환을 책임집니다.'},
      {zh:'如果价格合适，我们马上下单。',pinyin:'Rúguǒ jiàgé héshì, wǒmen mǎshàng xià dān.',kr:'가격이 적합하면 즉시 주문하겠습니다.'},
    ]},
  { title:'비교문: A比B+형용사 (A가 B보다 ~하다)', pattern:'[A] + 比 + [B] + [형용사]', structure:'比는 비교를 표현. 程度补语 많이/一点 추가 가능', category:'기본구조',
    examples:[
      {zh:'这个价格比上次高。',pinyin:'Zhège jiàgé bǐ shàng cì gāo.',kr:'이 가격이 지난번보다 높습니다.'},
      {zh:'海运比空运便宜很多。',pinyin:'Hǎiyùn bǐ kōngyùn piányí hěn duō.',kr:'해운이 항공운송보다 훨씬 저렴합니다.'},
      {zh:'你们的产品比竞争对手好。',pinyin:'Nǐmen de chǎnpǐn bǐ jìngzhēng duìshǒu hǎo.',kr:'귀사 제품이 경쟁사보다 좋습니다.'},
    ]},
  { title:'점층 강조: 越来越… (점점 더~)', pattern:'[주어] + 越来越 + [형용사/동사]', structure:'越来越는 시간이 지남에 따라 정도가 커짐을 표현', category:'기본구조',
    examples:[
      {zh:'韩国市场越来越大。',pinyin:'Hánguó shìchǎng yuèláiyuè dà.',kr:'한국 시장이 점점 커지고 있습니다.'},
      {zh:'客户要求越来越高。',pinyin:'Kèhù yāoqiú yuèláiyuè gāo.',kr:'고객 요구가 점점 높아지고 있습니다.'},
      {zh:'我们的合作越来越愉快。',pinyin:'Wǒmen de hézuò yuèláiyuè yúkuài.',kr:'저희 협력이 점점 즐거워지고 있습니다.'},
    ]},

  // ─── 가격·협상 패턴 ───────────────────────────────────────────────
  { title:'가격 문의', pattern:'[상품] + 的价格是多少？/ 报价多少？', structure:'多少(얼마)+钱/价格. 공식 문의 시 报价(견적) 사용', category:'가격협상',
    examples:[
      {zh:'这款产品的出口价格是多少？',pinyin:'Zhè kuǎn chǎnpǐn de chūkǒu jiàgé shì duōshao?',kr:'이 제품의 수출 가격은 얼마입니까?'},
      {zh:'FOB广州的报价是多少？',pinyin:'FOB Guǎngzhōu de bàojià shì duōshao?',kr:'광저우 FOB 견적은 얼마입니까?'},
      {zh:'含税含运费的总价是多少？',pinyin:'Hán shuì hán yùnfèi de zǒngjià shì duōshao?',kr:'세금 포함 운임 포함 총 가격은 얼마입니까?'},
    ]},
  { title:'가격 인하 요청', pattern:'价格能否 + 降/优惠 + [정도]？', structure:'能否(가능한가요?)+降(내리다)/优惠(우대하다)', category:'가격협상',
    examples:[
      {zh:'价格能否再降一点？',pinyin:'Jiàgé néng fǒu zài jiàng yīdiǎn?',kr:'가격을 조금 더 낮출 수 있나요?'},
      {zh:'如果我们长期合作，能给我们优惠价吗？',pinyin:'Rúguǒ wǒmen chángqī hézuò, néng gěi wǒmen yōuhuì jià ma?',kr:'장기 협력하면 우대 가격을 주실 수 있나요?'},
      {zh:'这已经是我们的最低价了。',pinyin:'Zhè yǐjīng shì wǒmen de zuìdī jià le.',kr:'이미 저희 최저가입니다.'},
    ]},
  { title:'가격 거절/수락', pattern:'这个价格[可以接受/有点高/太低了]', structure:'可以接受(수락가능)/有点高(조금높음)/太低了(너무낮음)', category:'가격협상',
    examples:[
      {zh:'这个价格我们可以接受。',pinyin:'Zhège jiàgé wǒmen kěyǐ jiēshòu.',kr:'이 가격은 저희가 수락할 수 있습니다.'},
      {zh:'这个价格有点超出我们预算。',pinyin:'Zhège jiàgé yǒudiǎn chāochū wǒmen yùsuàn.',kr:'이 가격이 저희 예산을 조금 초과합니다.'},
      {zh:'这个价格对我们来说太高了。',pinyin:'Zhège jiàgé duì wǒmen lái shuō tài gāo le.',kr:'이 가격은 저희에게 너무 높습니다.'},
    ]},
  { title:'대량 주문 협상', pattern:'如果 + 订购[수량]个/吨 + 能否给[우대조건]？', structure:'대량 주문을 조건으로 가격/서비스 우대 요청', category:'가격협상',
    examples:[
      {zh:'如果我们订购五千个，能给我们每个降一块钱吗？',pinyin:'Rúguǒ wǒmen dìnggòu wǔqiān gè, néng gěi wǒmen měi gè jiàng yī kuài qián ma?',kr:'5,000개를 주문하면 개당 1위안 내려주실 수 있나요?'},
      {zh:'大量采购可以给什么优惠？',pinyin:'Dàliàng cǎigòu kěyǐ gěi shénme yōuhuì?',kr:'대량 구매 시 어떤 혜택이 있나요?'},
      {zh:'年采购量超过一百万美元有什么特别政策？',pinyin:'Nián cǎigòu liàng chāoguò yībǎi wàn měiyuán yǒu shénme tèbié zhèngcè?',kr:'연간 구매량이 100만 달러 초과 시 특별 정책이 있나요?'},
    ],
    notes:'협상 시 구체적인 숫자를 제시하면 더 효과적입니다.'},
  { title:'가격 유효기간 확인', pattern:'这个报价有效期是多久？', structure:'有效期(유효기간)+是(이다)+多久(얼마나)', category:'가격협상',
    examples:[
      {zh:'这个报价有效期是多久？',pinyin:'Zhège bàojià yǒuxiào qī shì duō jiǔ?',kr:'이 견적의 유효기간은 얼마나 됩니까?'},
      {zh:'报价有效期为三十天。',pinyin:'Bàojià yǒuxiào qī wéi sānshí tiān.',kr:'견적 유효기간은 30일입니다.'},
      {zh:'原材料价格上涨，报价可能会调整。',pinyin:'Yuáncáiliào jiàgé shàngzhǎng, bàojià kěnéng huì tiáozhěng.',kr:'원자재 가격 상승으로 견적이 조정될 수 있습니다.'},
    ]},

  // ─── 납기·생산 패턴 ───────────────────────────────────────────────
  { title:'납기 문의', pattern:'什么时候可以 + [발송/납품] ？/ 交货期是多久？', structure:'什么时候(언제)+可以(가능)+发货/交货', category:'납기생산',
    examples:[
      {zh:'这批货什么时候可以发出？',pinyin:'Zhè pī huò shénme shíhòu kěyǐ fāchū?',kr:'이 화물은 언제 발송할 수 있나요?'},
      {zh:'交货期是多久？',pinyin:'Jiāohuòqī shì duō jiǔ?',kr:'납기일은 얼마나 됩니까?'},
      {zh:'最快什么时候能到货？',pinyin:'Zuì kuài shénme shíhòu néng dàohuò?',kr:'가장 빨리 언제 도착할 수 있습니까?'},
    ]},
  { title:'납기 단축 요청', pattern:'能否将交货期从[현재]提前到[목표]？', structure:'从[시작점]提前到[목표점]으로 앞당김 표현', category:'납기생산',
    examples:[
      {zh:'能否将交货期从四十五天压缩到三十天？',pinyin:'Néng fǒu jiāng jiāohuòqī cóng sìshíwǔ tiān yāsuō dào sānshí tiān?',kr:'납기를 45일에서 30일로 단축 가능합니까?'},
      {zh:'客户急需，请优先安排生产。',pinyin:'Kèhù jí xū, qǐng yōuxiān ānpái shēngchǎn.',kr:'고객이 급합니다, 우선 생산을 배정해주세요.'},
      {zh:'如果加急生产，需要额外的费用吗？',pinyin:'Rúguǒ jiājí shēngchǎn, xūyào éwài de fèiyòng ma?',kr:'긴급 생산이면 추가 비용이 필요합니까?'},
    ]},
  { title:'납기 지연 통보', pattern:'由于[이유]，交货期需要推迟[기간]。', structure:'由于(~때문에)+需要推迟(연기 필요)+[기간]', category:'납기생산',
    examples:[
      {zh:'由于原材料短缺，交货期需要推迟两周，请谅解。',pinyin:'Yóuyú yuáncáiliào duǎnquē, jiāohuòqī xūyào tuīchí liǎng zhōu, qǐng liàngjie.',kr:'원자재 부족으로 납기가 2주 연기됩니다, 양해 부탁드립니다.'},
      {zh:'生产设备出现故障，预计延误一周左右。',pinyin:'Shēngchǎn shèbèi chūxiàn gùzhàng, yùjì yánwù yī zhōu zuǒyòu.',kr:'생산 설비 고장으로 약 1주일 지연 예상됩니다.'},
      {zh:'我们会尽力补救，请稍等。',pinyin:'Wǒmen huì jìnlì bǔjiù, qǐng shāo děng.',kr:'저희가 최대한 만회하겠습니다, 잠시 기다려주세요.'},
    ]},
  { title:'생산 진행 확인', pattern:'生产进度怎么样了？/ 目前完成了多少？', structure:'进度(진도)+怎么样(어때요)+了(이미/변화)', category:'납기생산',
    examples:[
      {zh:'请问生产进度怎么样了？',pinyin:'Qǐngwèn shēngchǎn jìndù zěnmeyàng le?',kr:'생산 진도가 어떻게 됐나요?'},
      {zh:'目前已完成约60%。',pinyin:'Mùqián yǐ wánchéng yuē liùshí%.',kr:'현재 약 60% 완료됐습니다.'},
      {zh:'预计本周内完成生产。',pinyin:'Yùjì běn zhōu nèi wánchéng shēngchǎn.',kr:'이번 주 안에 생산 완료 예정입니다.'},
    ]},

  // ─── 품질·검사 패턴 ───────────────────────────────────────────────
  { title:'품질 요구사항 제시', pattern:'质量方面，我们要求 + [기준]', structure:'质量方面(품질 면에서)+要求(요구하다)+기준', category:'품질검사',
    examples:[
      {zh:'质量方面，不良率不得超过0.5%。',pinyin:'Zhìliàng fāngmiàn, bùliánglǜ bùdé chāoguò líng diǎn wǔ%.',kr:'품질 면에서 불량률이 0.5%를 초과해서는 안 됩니다.'},
      {zh:'产品必须通过KC和CE认证。',pinyin:'Chǎnpǐn bìxū tōngguò KC hé CE rènzhèng.',kr:'제품은 반드시 KC 및 CE 인증을 통과해야 합니다.'},
      {zh:'每批货出厂前必须全检。',pinyin:'Měi pī huò chūchǎng qián bìxū quán jiǎn.',kr:'각 배치 출하 전 반드시 전수 검사해야 합니다.'},
    ]},
  { title:'샘플 품질 피드백', pattern:'样品[이미/수령] + 整体[평가] + [구체사항]', structure:'수령(收到/已收) + 평가(还可以/不满意) + 개선사항', category:'품질검사',
    examples:[
      {zh:'样品已收到，整体来看还不错。',pinyin:'Yàngpǐn yǐ shōudào, zhěngtǐ lái kàn hái búcuò.',kr:'샘플 수령했습니다. 전체적으로 괜찮습니다.'},
      {zh:'颜色偏黄，请调整为中性白。',pinyin:'Yánsè piān huáng, qǐng tiáozhěng wéi zhōngxìng bái.',kr:'색상이 노란색으로 치우칩니다, 중성 화이트로 조정해주세요.'},
      {zh:'亮度不够，能否提升10%？',pinyin:'Liàngdù bùgòu, néng fǒu tíshēng shí%?',kr:'밝기가 부족합니다, 10% 높일 수 있나요?'},
    ]},
  { title:'불량품 클레임', pattern:'这批货中有[수량/비율]存在质量问题，要求[처리방법]', structure:'存在问题(문제 존재)+要求(요구)+处理方法(처리방법)', category:'품질검사',
    examples:[
      {zh:'这批货有约5%存在外观缺陷，要求全部更换。',pinyin:'Zhè pī huò yǒu yuē wǔ% cúnzài wàiguān quēxiàn, yāoqiú quánbù gēnghuàn.',kr:'이 배치에 약 5% 외관 결함이 있습니다, 전량 교환을 요구합니다.'},
      {zh:'灯不亮的产品请安排退换货处理。',pinyin:'Dēng bù liàng de chǎnpǐn qǐng ānpái tuìhuànhuò chǔlǐ.',kr:'점등 안 되는 제품은 반품/교환 처리 배정해주세요.'},
      {zh:'请发送质检报告和不良品照片。',pinyin:'Qǐng fāsòng zhìjiǎn bàogào hé bùliáng pǐn zhàopiàn.',kr:'품질검사 보고서와 불량품 사진을 보내주세요.'},
    ]},
  { title:'제3자 검사 요청', pattern:'出货前需要第三方检测，请配合。', structure:'第三方(제3자)+检测(검사)+请配合(협력 부탁)', category:'품질검사',
    examples:[
      {zh:'我们将委托SGS进行第三方验货。',pinyin:'Wǒmen jiāng wěituō SGS jìnxíng dìsānfāng yànhuò.',kr:'저희는 SGS에 제3자 검품을 위탁할 것입니다.'},
      {zh:'第三方检测费用由哪方承担？',pinyin:'Dìsānfāng jiǎncè fèiyòng yóu nǎ fāng chéngdān?',kr:'제3자 검사 비용은 어느 측이 부담합니까?'},
      {zh:'检测结果合格后再安排发货。',pinyin:'Jiǎncè jiéguǒ hégé hòu zài ānpái fāhuò.',kr:'검사 결과 합격 후 발송을 배정합니다.'},
    ]},

  // ─── 결제·송금 패턴 ───────────────────────────────────────────────
  { title:'결제 방식 협의', pattern:'付款方式是什么？/ 我们通常采用[방식]付款', structure:'付款方式(결제방식)+是(이다)+[T/T, L/C 등]', category:'결제송금',
    examples:[
      {zh:'你们接受什么付款方式？',pinyin:'Nǐmen jiēshòu shénme fùkuǎn fāngshì?',kr:'어떤 결제 방식을 받으십니까?'},
      {zh:'我们通常采用T/T电汇付款。',pinyin:'Wǒmen tōngcháng cǎiyòng T/T diànhuì fùkuǎn.',kr:'저희는 보통 T/T 전신환으로 결제합니다.'},
      {zh:'能否接受信用证L/C付款？',pinyin:'Néng fǒu jiēshòu xìnyòngzhèng L/C fùkuǎn?',kr:'신용장 L/C 결제를 받으실 수 있나요?'},
    ]},
  { title:'분할 결제 협의', pattern:'[비율]定金 + [비율]尾款(发货前/到货后)', structure:'定金(계약금)+尾款(잔금)+时间条件(조건)', category:'결제송금',
    examples:[
      {zh:'30%定金，70%发货前付清。',pinyin:'Sānshí% dìngjīn, qīshí% fāhuò qián fùqīng.',kr:'30% 계약금, 70% 발송 전 완납.'},
      {zh:'首批订单能否50%定金，50%到货付？',pinyin:'Shǒu pī dìngdān néng fǒu wǔshí% dìngjīn, wǔshí% dàohuò fù?',kr:'첫 주문은 50% 계약금, 50% 도착 후 결제가 가능합니까?'},
      {zh:'老客户可以给60天账期。',pinyin:'Lǎo kèhù kěyǐ gěi liùshí tiān zhàngqī.',kr:'기존 고객은 60일 결제 기간을 드릴 수 있습니다.'},
    ]},
  { title:'송금 확인', pattern:'款项已汇出，请查收。/ 请确认是否收到货款。', structure:'已汇出(이미 송금함)+请查收(확인 부탁)', category:'결제송금',
    examples:[
      {zh:'货款已于今日汇出，请查收。',pinyin:'Huòkuǎn yǐ yú jīnrì huìchū, qǐng cháshōu.',kr:'대금을 오늘 송금했습니다, 확인해주세요.'},
      {zh:'请确认收到30%定金后安排生产。',pinyin:'Qǐng quèrèn shōudào sānshí% dìngjīn hòu ānpái shēngchǎn.',kr:'30% 계약금 수령 확인 후 생산을 배정해주세요.'},
      {zh:'款项到账后会立即通知您。',pinyin:'Kuǎnxiàng dàozhàng hòu huì lìjí tōngzhī nín.',kr:'금액 입금 후 즉시 알려드리겠습니다.'},
    ]},

  // ─── 이메일·공식 소통 패턴 ────────────────────────────────────────
  { title:'이메일 시작 표현', pattern:'您好！/ 尊敬的[이름/직함]，', structure:'공식도: 尊敬的>您好>你好. 처음엔 공식체 사용', category:'이메일소통',
    examples:[
      {zh:'尊敬的李总，您好！',pinyin:'Zūnjìng de Lǐ zǒng, nín hǎo!',kr:'존경하는 이 사장님, 안녕하십니까!'},
      {zh:'您好，感谢您的来信。',pinyin:'Nín hǎo, gǎnxiè nín de láixìn.',kr:'안녕하세요, 서신에 감사드립니다.'},
      {zh:'您好，我是YNK贸易的金部长。',pinyin:'Nín hǎo, wǒ shì YNK màoyì de Jīn bùzhǎng.',kr:'안녕하세요, 저는 YNK 무역의 김 부장입니다.'},
    ]},
  { title:'이메일 마무리 표현', pattern:'期待您的回复。/ 请尽快回复。/ 谢谢！', structure:'마무리: 感谢+期待+此致敬礼(경구). 상대 존중 표현', category:'이메일소통',
    examples:[
      {zh:'期待您的早日回复，谢谢！',pinyin:'Qīdài nín de zǎorì huífù, xièxie!',kr:'조속한 회신 기다리겠습니다, 감사합니다!'},
      {zh:'如有任何问题，请随时联系我。',pinyin:'Rú yǒu rènhé wèntí, qǐng suíshí liánxì wǒ.',kr:'어떤 문제든 언제든지 연락하세요.'},
      {zh:'此致敬礼！',pinyin:'Cǐ zhì jìng lǐ!',kr:'경의를 표합니다! (이메일 결문)'},
    ]},
  { title:'첨부파일 안내', pattern:'请见附件中的[파일명]，如有问题请告知。', structure:'请见附件(첨부 참고)+如有问题(문제 있으면)+告知(알림)', category:'이메일소통',
    examples:[
      {zh:'请见附件中的报价单，如有疑问请告知。',pinyin:'Qǐng jiàn fùjiàn zhōng de bàojiàdān, rú yǒu yíwèn qǐng gàozhī.',kr:'첨부의 견적서를 참고해주세요, 의문사항 있으면 알려주세요.'},
      {zh:'附件是我们的产品目录，请参考。',pinyin:'Fùjiàn shì wǒmen de chǎnpǐn mùlù, qǐng cānkǎo.',kr:'첨부는 저희 제품 카탈로그입니다, 참고해주세요.'},
      {zh:'请签署附件合同后回传。',pinyin:'Qǐng qiānshǔ fùjiàn hétong hòu huíchuán.',kr:'첨부 계약서에 서명 후 반송해주세요.'},
    ]},
  { title:'재확인 요청', pattern:'请再次确认一下[내용]。/ 麻烦您核实一下。', structure:'再次(다시)+确认(확인)+一下(한번). 정중한 확인 요청', category:'이메일소통',
    examples:[
      {zh:'请再次确认一下交货日期。',pinyin:'Qǐng zàicì quèrèn yīxià jiāohuò rìqī.',kr:'납품 날짜를 다시 한번 확인해주세요.'},
      {zh:'麻烦您核实一下订单数量。',pinyin:'Máfan nín héshí yīxià dìngdān shùliàng.',kr:'수고스럽지만 주문 수량을 확인해주세요.'},
      {zh:'能否确认已收到我方付款？',pinyin:'Néng fǒu quèrèn yǐ shōudào wǒfāng fùkuǎn?',kr:'저희 결제를 수령했음을 확인해주실 수 있나요?'},
    ]},

  // ─── 회의·프레젠테이션 패턴 ──────────────────────────────────────
  { title:'회의 시작', pattern:'我们今天的议题是… / 开始今天的会议', structure:'议题(아젠다)+是+내용. 开始(시작)+今天的会议(오늘 회의)', category:'회의',
    examples:[
      {zh:'我们今天的议题是新一批订单的条款。',pinyin:'Wǒmen jīntiān de yìtí shì xīn yī pī dìngdān de tiáokuǎn.',kr:'오늘 의제는 새 배치 주문 조건입니다.'},
      {zh:'请各位介绍一下自己。',pinyin:'Qǐng gèwèi jièshào yīxià zìjǐ.',kr:'각자 자기소개를 해주세요.'},
      {zh:'今天会议预计需要一个小时。',pinyin:'Jīntiān huìyì yùjì xūyào yī gè xiǎoshí.',kr:'오늘 회의는 약 1시간 예상됩니다.'},
    ]},
  { title:'의견 제시', pattern:'我认为…/ 我们的立场是…/ 从我方角度来看…', structure:'我认为(저는 ~라고 생각합니다)+我们的立场(저희 입장)', category:'회의',
    examples:[
      {zh:'我认为这个条款需要修改。',pinyin:'Wǒ rènwéi zhège tiáokuǎn xūyào xiūgǎi.',kr:'저는 이 조항이 수정이 필요하다고 생각합니다.'},
      {zh:'我们的立场是交货期不能超过三十天。',pinyin:'Wǒmen de lìchǎng shì jiāohuòqī bù néng chāoguò sānshí tiān.',kr:'저희 입장은 납기가 30일을 초과할 수 없다는 것입니다.'},
      {zh:'从我方角度来看，价格需要下调。',pinyin:'Cóng wǒfāng jiǎodù lái kàn, jiàgé xūyào xiàtiáo.',kr:'저희 측 관점에서 가격이 인하될 필요가 있습니다.'},
    ]},
  { title:'동의/반대 표현', pattern:'我们同意…/ 对于这点，我们有不同意见。', structure:'同意(동의)+反对(반대)+我们有不同意见(다른 의견 있음)', category:'회의',
    examples:[
      {zh:'我们完全同意贵方的提议。',pinyin:'Wǒmen wánquán tóngyì guìfāng de tíyì.',kr:'저희는 귀측 제안에 완전히 동의합니다.'},
      {zh:'对于付款条件，我们有不同意见。',pinyin:'Duìyú fùkuǎn tiáojiàn, wǒmen yǒu bùtóng yìjiàn.',kr:'결제 조건에 대해서는 다른 의견이 있습니다.'},
      {zh:'原则上同意，细节需要进一步确认。',pinyin:'Yuánzé shàng tóngyì, xìjié xūyào jìnyībù quèrèn.',kr:'원칙적으로 동의하나, 세부사항은 추가 확인이 필요합니다.'},
    ]},
  { title:'회의 마무리', pattern:'今天的会议就到这里。/ 下次会议…', structure:'就到这里(여기까지)+下次(다음번)+[후속 조치]', category:'회의',
    examples:[
      {zh:'今天的会议就到这里，感谢大家！',pinyin:'Jīntiān de huìyì jiù dào zhèlǐ, gǎnxiè dàjiā!',kr:'오늘 회의는 여기까지입니다, 모두 감사합니다!'},
      {zh:'会议纪要我们这边整理后发给您。',pinyin:'Huìyì jìyào wǒmen zhèbiān zhěnglǐ hòu fā gěi nín.',kr:'회의록을 저희 쪽에서 정리 후 보내드리겠습니다.'},
      {zh:'下次视频会议定在下周三，请确认。',pinyin:'Xià cì shìpín huìyì dìng zài xià zhōusān, qǐng quèrèn.',kr:'다음 화상회의는 다음 주 수요일로 정했습니다, 확인해주세요.'},
    ]},

  // ─── 사과·감사 표현 ───────────────────────────────────────────────
  { title:'공식 사과', pattern:'对于[사안]，我们深感抱歉。/ 非常对不起。', structure:'深感抱歉(깊이 사과드립니다)+原因(이유)+改善措施(개선방안)', category:'사과감사',
    examples:[
      {zh:'对于此次发货延误，我们深感抱歉。',pinyin:'Duìyú cǐcì fāhuò yánwù, wǒmen shēn gǎn bàoqiàn.',kr:'이번 발송 지연에 대해 깊이 사과드립니다.'},
      {zh:'由于我方失误造成的损失，我们将负责赔偿。',pinyin:'Yóuyú wǒfāng shīwù zàochéng de sǔnshī, wǒmen jiāng fùzé péicháng.',kr:'저희 실수로 인한 손실에 대해 배상을 책임지겠습니다.'},
      {zh:'我们会吸取教训，避免同样的问题再次发生。',pinyin:'Wǒmen huì xīqǔ jiàoxun, bìmiǎn tóngyàng de wèntí zàicì fāshēng.',kr:'저희는 교훈을 얻어 같은 문제가 다시 발생하지 않도록 하겠습니다.'},
    ]},
  { title:'감사 표현', pattern:'感谢贵公司[내용]。/ 非常感谢您的[내용]。', structure:'感谢(감사)+贵公司(귀사)+내용. 非常(매우)+感谢(감사)', category:'사과감사',
    examples:[
      {zh:'感谢贵公司多年来的支持与合作。',pinyin:'Gǎnxiè guì gōngsī duō nián lái de zhīchí yǔ hézuò.',kr:'귀사의 다년간 지원과 협력에 감사드립니다.'},
      {zh:'非常感谢您百忙之中抽时间回复。',pinyin:'Fēicháng gǎnxiè nín bǎimáng zhī zhōng chōu shíjiān huífù.',kr:'바쁘신 중에 시간 내어 회신해주셔서 정말 감사합니다.'},
      {zh:'谢谢您的配合，期待继续合作！',pinyin:'Xièxiè nín de pèihé, qīdài jìxù hézuò!',kr:'협력에 감사드리며, 지속적인 협력을 기대합니다!'},
    ]},

  // ─── 부탁·요청 표현 ───────────────────────────────────────────────
  { title:'정중한 요청: 请/麻烦', pattern:'请 + [동사] / 麻烦您 + [동사] + 一下', structure:'请(부탁): 일반적. 麻烦您(수고스럽지만): 더 정중', category:'부탁요청',
    examples:[
      {zh:'请发一下最新的报价单。',pinyin:'Qǐng fā yīxià zuìxīn de bàojiàdān.',kr:'최신 견적서를 보내주세요.'},
      {zh:'麻烦您帮忙确认一下库存情况。',pinyin:'Máfan nín bāngmáng quèrèn yīxià kùcún qíngkuàng.',kr:'수고스럽지만 재고 상황을 확인해주세요.'},
      {zh:'请尽快处理这件事。',pinyin:'Qǐng jǐnkuài chǔlǐ zhè jiàn shì.',kr:'이 일을 빨리 처리해주세요.'},
    ]},
  { title:'가능 여부 문의: 能否/是否可以', pattern:'能否 + [동사구] ？/ 是否可以 + [동사구] ？', structure:'能否(가능한가요?): 공식적. 是否可以: 더 정중', category:'부탁요청',
    examples:[
      {zh:'能否在本周内提供样品？',pinyin:'Néng fǒu zài běn zhōu nèi tígōng yàngpǐn?',kr:'이번 주 안에 샘플을 제공할 수 있습니까?'},
      {zh:'是否可以提供三年质保？',pinyin:'Shìfǒu kěyǐ tígōng sān nián zhìbǎo?',kr:'3년 품질보증을 제공할 수 있습니까?'},
      {zh:'贵公司能否安排工厂参观？',pinyin:'Guì gōngsī néng fǒu ānpái gōngchǎng cānguān?',kr:'귀사에서 공장 견학을 배정해줄 수 있습니까?'},
    ]},
  { title:'조건 제시: 只要…就…', pattern:'只要 + [조건] + 就 + [결과]', structure:'只要(~만 하면)+就(~이다). 조건이 충족되면 결과 보장', category:'부탁요청',
    examples:[
      {zh:'只要质量达标，我们就长期合作。',pinyin:'Zhǐyào zhìliàng dábiāo, wǒmen jiù chángqī hézuò.',kr:'품질만 기준에 달하면 장기 협력하겠습니다.'},
      {zh:'只要价格合理，我们今天就可以下单。',pinyin:'Zhǐyào jiàgé hélǐ, wǒmen jīntiān jiù kěyǐ xià dān.',kr:'가격만 합리적이면 오늘 주문할 수 있습니다.'},
      {zh:'只要能按时交货，其他条件都好商量。',pinyin:'Zhǐyào néng àn shí jiāohuò, qítā tiáojiàn dōu hǎo shāngliáng.',kr:'제때 납품만 가능하면 다른 조건은 협의 가능합니다.'},
    ]},

  // ─── 고급 비즈니스 패턴 ───────────────────────────────────────────
  { title:'파트너십 제안', pattern:'我们希望与贵公司建立长期稳定的合作关系', structure:'希望与…建立(~와 구축 희망)+长期稳定(장기안정적)+合作关系(협력관계)', category:'파트너십',
    examples:[
      {zh:'我们希望与贵公司建立长期战略合作关系。',pinyin:'Wǒmen xīwàng yǔ guì gōngsī jiànlì chángqī zhànlüè hézuò guānxi.',kr:'저희는 귀사와 장기적인 전략적 협력 관계를 구축하길 희망합니다.'},
      {zh:'我们有意成为贵公司在韩国的独家总代理。',pinyin:'Wǒmen yǒuyì chéngwéi guì gōngsī zài Hánguó de dújiā zǒng dàilǐ.',kr:'저희는 귀사의 한국 독점 총대리가 될 의향이 있습니다.'},
      {zh:'希望双方共同开拓韩国市场。',pinyin:'Xīwàng shuāngfāng gòngtóng kāituò Hánguó shìchǎng.',kr:'양측이 공동으로 한국 시장을 개척하길 희망합니다.'},
    ]},
  { title:'클레임 처리', pattern:'对于此次问题，我方立场是… 希望贵方…', structure:'我方立场(우리 측 입장)+希望贵方(귀측에서 ~하길 바람)', category:'클레임',
    examples:[
      {zh:'对于此次质量问题，我方要求全额赔偿。',pinyin:'Duìyú cǐcì zhìliàng wèntí, wǒfāng yāoqiú quán\'é péicháng.',kr:'이번 품질 문제에 대해 저희는 전액 배상을 요구합니다.'},
      {zh:'建议双方友好协商，找到合理的解决方案。',pinyin:'Jiànyì shuāngfāng yǒuhǎo xiéshāng, zhǎodào hélǐ de jiějué fāng\'àn.',kr:'양측이 우호적으로 협상하여 합리적인 해결 방안을 찾길 제안합니다.'},
      {zh:'如协商不成，我们将依据合同条款处理。',pinyin:'Rú xiéshāng bùchéng, wǒmen jiāng yījù hétong tiáokuǎn chǔlǐ.',kr:'협상 불성립 시 계약 조항에 따라 처리하겠습니다.'},
    ]},

  // ═══ 시제 표현 ═══════════════════════════════════════════════════════
  { title:'과거 완료: 已经…了', pattern:'已经 + [동사구] + 了', structure:'已经(이미)+동사+了 → 동작이 완료됐음을 강조', category:'시제표현',
    notes:'了는 동작 완료나 상황 변화를 나타냄. 已经과 함께 쓰면 완료 의미 강화',
    examples:[
      {zh:'货物已经发出了。',pinyin:'Huòwù yǐjīng fā chū le.',kr:'화물이 이미 발송됐습니다.'},
      {zh:'合同已经签好了。',pinyin:'Hétong yǐjīng qiān hǎo le.',kr:'계약서가 이미 서명됐습니다.'},
      {zh:'款项已经汇过去了。',pinyin:'Kuǎnxiàng yǐjīng huì guòqù le.',kr:'대금이 이미 송금됐습니다.'},
    ]},
  { title:'진행 중: 正在…呢', pattern:'正在 + [동사구] + 呢', structure:'正在(~하는 중)+동사+呢 → 지금 이 순간 진행 중인 동작', category:'시제표현',
    notes:'呢는 생략 가능. 进行中, 还在도 비슷한 용법',
    examples:[
      {zh:'我们正在生产中，请稍等。',pinyin:'Wǒmen zhèngzài shēngchǎn zhōng, qǐng shāo děng.',kr:'저희는 생산 중이니 잠시 기다려주세요.'},
      {zh:'工程师正在检测产品呢。',pinyin:'Gōngchéngshī zhèngzài jiǎncè chǎnpǐn ne.',kr:'엔지니어가 제품을 검사 중입니다.'},
      {zh:'我们正在讨论报价方案。',pinyin:'Wǒmen zhèngzài tǎolùn bàojià fāng\'àn.',kr:'저희는 견적 방안을 논의 중입니다.'},
    ]},
  { title:'가까운 미래: 快…了 / 就要…了', pattern:'快 + [동사구] + 了 / 就要 + [동사구] + 了', structure:'快/就要+동사+了 → 곧 ~하게 된다는 임박한 미래', category:'시제표현',
    notes:'时间副词(马上, 快, 就要)와 함께 써서 임박성 표현',
    examples:[
      {zh:'货物快到了，请做好收货准备。',pinyin:'Huòwù kuài dào le, qǐng zuò hǎo shōuhuò zhǔnbèi.',kr:'화물이 곧 도착하니 수령 준비를 해주세요.'},
      {zh:'合同就要到期了，请尽快续签。',pinyin:'Hétong jiùyào dàoqī le, qǐng jǐnkuài xù qiān.',kr:'계약이 곧 만료되니 빨리 갱신해주세요.'},
      {zh:'我们快完成生产了。',pinyin:'Wǒmen kuài wánchéng shēngchǎn le.',kr:'저희 곧 생산을 완료합니다.'},
    ]},
  { title:'경험: …过', pattern:'[주어] + [동사] + 过 + [목적어]', structure:'동사+过 → 과거에 ~한 경험이 있음. 부정은 没+동사+过', category:'시제표현',
    notes:'이미 경험의 유무를 묻거나 말할 때 사용. 了와 다름(过=경험, 了=완료)',
    examples:[
      {zh:'我们合作过两次。',pinyin:'Wǒmen hézuò guò liǎng cì.',kr:'저희는 두 번 협력한 적이 있습니다.'},
      {zh:'这个问题我们遇到过。',pinyin:'Zhège wèntí wǒmen yùdào guò.',kr:'이 문제는 우리가 겪어본 적이 있습니다.'},
      {zh:'我从来没去过广交会。',pinyin:'Wǒ cónglái méi qù guò Guǎngjiāohuì.',kr:'저는 광저우 박람회에 한 번도 가본 적이 없습니다.'},
    ]},
  { title:'지속 상태: …着', pattern:'[동사] + 着 + [목적어]', structure:'동사+着 → 동작이 지속되는 상태를 나타냄', category:'시제표현',
    notes:'听着, 等着, 看着처럼 상태 유지를 표현. 进行时와 구별됨',
    examples:[
      {zh:'我们等着您的回复。',pinyin:'Wǒmen děngzhe nín de huífù.',kr:'저희는 귀하의 회신을 기다리고 있습니다.'},
      {zh:'会议室开着呢，快进来。',pinyin:'Huìyìshì kāizhe ne, kuài jìnlái.',kr:'회의실이 열려 있으니 빨리 들어오세요.'},
      {zh:'合同摆着，等您签字。',pinyin:'Hétong bǎizhe, děng nín qiānzì.',kr:'계약서가 놓여 있으니 서명을 기다립니다.'},
    ]},

  // ═══ 비교문 ══════════════════════════════════════════════════════════
  { title:'비교: A比B+형용사', pattern:'A + 比 + B + [형용사]', structure:'A가 B보다 ~하다. 정도 차이는 형용사 뒤에 추가', category:'비교문',
    notes:'부정은 A没有B+형용사. 정도: A比B贵得多(훨씬), 贵一点(조금)',
    examples:[
      {zh:'我们的价格比竞争对手便宜20%。',pinyin:'Wǒmen de jiàgé bǐ jìngzhēng duìshǒu piányí 20%.',kr:'저희 가격은 경쟁사보다 20% 저렴합니다.'},
      {zh:'新款比旧款效率高得多。',pinyin:'Xīn kuǎn bǐ jiù kuǎn xiàolǜ gāo de duō.',kr:'신형이 구형보다 효율이 훨씬 높습니다.'},
      {zh:'空运比海运快，但费用高。',pinyin:'Kōngyùn bǐ hǎiyùn kuài, dàn fèiyòng gāo.',kr:'항공이 해운보다 빠르지만 비용이 높습니다.'},
    ]},
  { title:'동등 비교: A跟B一样', pattern:'A + 跟/和 + B + 一样 + [형용사]', structure:'A는 B와 같이 ~하다', category:'비교문',
    notes:'부정: A跟B不一样. 강조: 完全一样(완전히 같다)',
    examples:[
      {zh:'这批货的质量跟上次一样好。',pinyin:'Zhè pī huò de zhìliàng gēn shàng cì yīyàng hǎo.',kr:'이번 화물 품질이 지난번과 같이 좋습니다.'},
      {zh:'我们的标准和国际标准一样。',pinyin:'Wǒmen de biāozhǔn hé guójì biāozhǔn yīyàng.',kr:'저희 기준은 국제 기준과 같습니다.'},
      {zh:'两款产品性能基本一样。',pinyin:'Liǎng kuǎn chǎnpǐn xìngnéng jīběn yīyàng.',kr:'두 제품의 성능은 기본적으로 같습니다.'},
    ]},
  { title:'최상급: 最+형용사', pattern:'最 + [형용사] + 的 + [명사]', structure:'最(가장)+형용사 → 최상급 표현', category:'비교문',
    notes:'最+형용사 뒤에 了를 붙이면 감탄 의미 강화됨',
    examples:[
      {zh:'这是我们最畅销的产品。',pinyin:'Zhè shì wǒmen zuì chàngxiāo de chǎnpǐn.',kr:'이것이 저희의 가장 잘 팔리는 제품입니다.'},
      {zh:'质量是我们最重视的。',pinyin:'Zhìliàng shì wǒmen zuì zhòngshì de.',kr:'품질이 저희가 가장 중시하는 것입니다.'},
      {zh:'现在是最好的合作时机。',pinyin:'Xiànzài shì zuìhǎo de hézuò shíjī.',kr:'지금이 가장 좋은 협력 시기입니다.'},
    ]},
  { title:'점진 비교: 越来越…', pattern:'[주어] + 越来越 + [형용사/동사]', structure:'越来越(점점 더) → 변화가 진행 중임을 표현', category:'비교문',
    examples:[
      {zh:'LED产品越来越受欢迎。',pinyin:'LED chǎnpǐn yuèláiyuè shòu huānyíng.',kr:'LED 제품이 점점 더 인기를 얻고 있습니다.'},
      {zh:'我们的合作越来越顺利。',pinyin:'Wǒmen de hézuò yuèláiyuè shùnlì.',kr:'저희 협력이 점점 순조롭습니다.'},
      {zh:'原材料成本越来越高。',pinyin:'Yuáncáiliào chéngběn yuèláiyuè gāo.',kr:'원자재 비용이 점점 높아집니다.'},
    ]},
  { title:'비례 비교: 越A越B', pattern:'越 + A + 越 + B', structure:'~하면 할수록 ~하다', category:'비교문',
    examples:[
      {zh:'订单越多，价格越低。',pinyin:'Dìngdān yuè duō, jiàgé yuè dī.',kr:'주문이 많을수록 가격이 낮아집니다.'},
      {zh:'越早下单，越早发货。',pinyin:'Yuè zǎo xià dān, yuè zǎo fāhuò.',kr:'일찍 주문할수록 일찍 발송합니다.'},
      {zh:'质量越好，口碑越好。',pinyin:'Zhìliàng yuè hǎo, kǒubēi yuè hǎo.',kr:'품질이 좋을수록 평판이 좋아집니다.'},
    ]},

  // ═══ 조건·가정 ═══════════════════════════════════════════════════════
  { title:'가정: 要是…的话，就…', pattern:'要是/假如 + [가정] + 的话，就 + [결과]', structure:'要是/假如(만약 ~이라면)+就(그러면)', category:'조건가정',
    notes:'如果보다 구어적. 的话는 생략 가능',
    examples:[
      {zh:'要是价格再低一点的话，我们就可以签合同。',pinyin:'Yàoshi jiàgé zài dī yīdiǎn de huà, wǒmen jiù kěyǐ qiān hétong.',kr:'만약 가격이 조금 더 낮으면 계약서에 서명할 수 있습니다.'},
      {zh:'假如交货期太长，我们只好找别的供应商。',pinyin:'Jiǎrú jiāohuò qī tài cháng, wǒmen zhǐhǎo zhǎo bié de gōngyìngshāng.',kr:'만약 납기가 너무 길면 다른 공급업체를 찾을 수밖에 없습니다.'},
      {zh:'要是质量不过关，我们会拒收。',pinyin:'Yàoshi zhìliàng bù guòguān, wǒmen huì jùshōu.',kr:'만약 품질이 기준에 미달하면 저희는 수령을 거부합니다.'},
    ]},
  { title:'조건: 只要…就…', pattern:'只要 + [조건] + 就 + [결과]', structure:'只要(~하기만 하면)+就(반드시~)', category:'조건가정',
    notes:'조건이 충족되면 결과가 반드시 따라온다는 뉘앙스',
    examples:[
      {zh:'只要质量过关，价格我们可以接受。',pinyin:'Zhǐyào zhìliàng guòguān, jiàgé wǒmen kěyǐ jiēshòu.',kr:'품질만 기준을 통과하면 가격은 받아들일 수 있습니다.'},
      {zh:'只要按时交货，我们保证全款结清。',pinyin:'Zhǐyào ànshí jiāohuò, wǒmen bǎozhèng quán kuǎn jiéqīng.',kr:'제때 납품하기만 하면 전액 결제를 보증합니다.'},
      {zh:'只要双方达成共识，合作就能顺利推进。',pinyin:'Zhǐyào shuāngfāng dáchéng gòngshí, hézuò jiù néng shùnlì tuījìn.',kr:'양측이 합의만 이루면 협력이 순조롭게 추진됩니다.'},
    ]},
  { title:'양보: 即使/就算…也…', pattern:'即使/就算 + [양보] + 也 + [결과]', structure:'即使(설령~이더라도)+也(여전히/그래도)', category:'조건가정',
    notes:'虽然…但是…와 비슷하지만 더 강한 양보의 의미',
    examples:[
      {zh:'即使价格高一点，我们也愿意合作。',pinyin:'Jíshǐ jiàgé gāo yīdiǎn, wǒmen yě yuànyì hézuò.',kr:'설령 가격이 조금 높더라도 저희는 기꺼이 협력합니다.'},
      {zh:'就算遇到困难，我们也不会放弃。',pinyin:'Jiùsuàn yùdào kùnnán, wǒmen yě bù huì fàngqì.',kr:'설령 어려움이 있더라도 저희는 포기하지 않습니다.'},
      {zh:'即使要加急生产，也要保证质量。',pinyin:'Jíshǐ yào jiājí shēngchǎn, yě yào bǎozhèng zhìliàng.',kr:'설령 긴급 생산이더라도 품질을 보증해야 합니다.'},
    ]},
  { title:'부정 조건: 除非…才…', pattern:'除非 + [조건], 才 + [결과]', structure:'除非(~이 아닌 한/~해야만)+才(비로소)', category:'조건가정',
    notes:'제한적 조건을 강조할 때 사용',
    examples:[
      {zh:'除非价格降到25美元，我们才会下单。',pinyin:'Chúfēi jiàgé jiàng dào 25 Měiyuán, wǒmen cái huì xià dān.',kr:'가격이 25달러까지 내려야만 주문하겠습니다.'},
      {zh:'除非质量达标，否则我们不会验收。',pinyin:'Chúfēi zhìliàng dábīāo, fǒuzé wǒmen bù huì yànshōu.',kr:'품질이 기준에 달해야만 검수하겠습니다.'},
      {zh:'除非对方同意延期，否则必须按时交货。',pinyin:'Chúfēi duìfāng tóngyì yánqī, fǒuzé bìxū ànshí jiāohuò.',kr:'상대방이 연기에 동의하지 않으면 제때 납품해야 합니다.'},
    ]},

  // ═══ 수동·피동 ═══════════════════════════════════════════════════════
  { title:'被자문: 被+행위자+동사', pattern:'[주어] + 被 + [행위자] + [동사]', structure:'被(~에 의해) → 수동태. 주어가 동작을 받음', category:'수동피동',
    notes:'부정적 상황에 주로 쓰임. 행위자 생략 가능: 被取消了',
    examples:[
      {zh:'这批货被海关扣押了。',pinyin:'Zhè pī huò bèi hǎiguān kōuyā le.',kr:'이 화물이 세관에 억류됐습니다.'},
      {zh:'合同被对方单方面取消了。',pinyin:'Hétong bèi duìfāng dān fāngmiàn qǔxiāo le.',kr:'계약이 상대방에 의해 일방적으로 취소됐습니다.'},
      {zh:'我们的报价被客户接受了。',pinyin:'Wǒmen de bàojià bèi kèhù jiēshòu le.',kr:'저희 견적이 고객에게 받아들여졌습니다.'},
    ]},
  { title:'把자문: 把+목적어+동사', pattern:'[주어] + 把 + [목적어] + [동사+결과]', structure:'把(~을) → 목적어를 처치/처분하는 문형. 결과 필수', category:'수동피동',
    notes:'把자문은 결과나 방향보어 필수. 단순 동사만으론 불완전',
    examples:[
      {zh:'请把报价单发给我。',pinyin:'Qǐng bǎ bàojià dān fā gěi wǒ.',kr:'견적서를 저에게 보내주세요.'},
      {zh:'我们把货物分三批发出。',pinyin:'Wǒmen bǎ huòwù fēn sān pī fā chū.',kr:'저희는 화물을 3배치로 나눠 발송합니다.'},
      {zh:'请把合同条款改一下。',pinyin:'Qǐng bǎ hétong tiáokuǎn gǎi yīxià.',kr:'계약 조항을 수정해주세요.'},
    ]},

  // ═══ 보어 ════════════════════════════════════════════════════════════
  { title:'결과보어: 동사+好/完/到/掉', pattern:'[동사] + 好/完/到/掉 + [목적어]', structure:'동사+결과보어 → 동작의 결과 상태를 표현', category:'보어',
    notes:'好(잘 ~하다), 完(~을 끝내다), 到(~에 달하다/도착하다), 掉(없애다/해버리다)',
    examples:[
      {zh:'请把合同填好再发过来。',pinyin:'Qǐng bǎ hétong tián hǎo zài fā guòlái.',kr:'계약서를 다 작성한 후 보내주세요.'},
      {zh:'生产任务已经完成了。',pinyin:'Shēngchǎn rènwù yǐjīng wánchéng le.',kr:'생산 임무가 이미 완료됐습니다.'},
      {zh:'我们已经找到了合适的供应商。',pinyin:'Wǒmen yǐjīng zhǎodào le héshì de gōngyìngshāng.',kr:'저희는 이미 적합한 공급업체를 찾았습니다.'},
    ]},
  { title:'정도보어: 动+得+정도', pattern:'[동사/형용사] + 得 + [정도표현]', structure:'동사+得+정도 → 동작의 정도나 상태를 보충 설명', category:'보어',
    notes:'得 앞에 목적어가 있을 경우 동사 반복: 说中文说得很好',
    examples:[
      {zh:'他中文说得非常流利。',pinyin:'Tā Zhōngwén shuō de fēicháng liúlì.',kr:'그는 중국어를 매우 유창하게 합니다.'},
      {zh:'这批货质量做得很好。',pinyin:'Zhè pī huò zhìliàng zuò de hěn hǎo.',kr:'이 화물의 품질이 매우 잘 만들어졌습니다.'},
      {zh:'产品包装得非常仔细。',pinyin:'Chǎnpǐn bāozhuāng de fēicháng zǐxì.',kr:'제품이 매우 꼼꼼하게 포장됐습니다.'},
    ]},
  { title:'방향보어: 동사+来/去/上/下/进', pattern:'[동사] + 来/去/上/下/进/出', structure:'동작의 방향을 나타냄. 来(이쪽)/去(저쪽)/上(위)/下(아래)/进(안)/出(밖)', category:'보어',
    examples:[
      {zh:'请把文件发过来。',pinyin:'Qǐng bǎ wénjiàn fā guòlái.',kr:'서류를 이쪽으로 보내주세요.'},
      {zh:'把货物卸下来，放到仓库里。',pinyin:'Bǎ huòwù xiè xiàlái, fàng dào cāngkù lǐ.',kr:'화물을 내려서 창고에 넣으세요.'},
      {zh:'新产品推出来了。',pinyin:'Xīn chǎnpǐn tuī chūlái le.',kr:'신제품이 출시됐습니다.'},
    ]},

  // ═══ 전치사구 ════════════════════════════════════════════════════════
  { title:'대상: 对(于)…来说', pattern:'对(于) + [대상] + 来说', structure:'~에게 있어서/~의 관점에서', category:'전치사구',
    examples:[
      {zh:'对我们公司来说，质量是第一位的。',pinyin:'Duì wǒmen gōngsī lái shuō, zhìliàng shì dì yī wèi de.',kr:'저희 회사에 있어서 품질이 최우선입니다.'},
      {zh:'对于韩国市场来说，价格很重要。',pinyin:'Duìyú Hánguó shìchǎng lái shuō, jiàgé hěn zhòngyào.',kr:'한국 시장에 있어서 가격은 매우 중요합니다.'},
      {zh:'对贵方来说，这是一个好机会。',pinyin:'Duì guì fāng lái shuō, zhè shì yī gè hǎo jīhuì.',kr:'귀측에게 있어서 이것은 좋은 기회입니다.'},
    ]},
  { title:'근거: 根据/按照…', pattern:'根据/按照 + [근거] + [행동]', structure:'根据(~에 근거하여)/按照(~에 따라)', category:'전치사구',
    examples:[
      {zh:'根据合同条款，货款应在30天内支付。',pinyin:'Gēnjù hétong tiáokuǎn, huòkuǎn yīng zài 30 tiān nèi zhīfù.',kr:'계약 조항에 근거하여 대금은 30일 내에 지불해야 합니다.'},
      {zh:'按照国际惯例，FOB价格不含运费。',pinyin:'Ànzhào guójì guànlì, FOB jiàgé bù hán yùnfèi.',kr:'국제 관례에 따라 FOB 가격은 운임을 포함하지 않습니다.'},
      {zh:'根据市场调研，需求量在增加。',pinyin:'Gēnjù shìchǎng diàoyán, xūqiú liàng zài zēngjiā.',kr:'시장 조사에 근거하여 수요량이 증가하고 있습니다.'},
    ]},
  { title:'이유: 由于/因为…，所以/因此…', pattern:'由于/因为 + [이유] + 所以/因此 + [결과]', structure:'由于/因为(~때문에)+所以/因此(그래서)', category:'전치사구',
    notes:'由于는 문어체, 因为는 구어체. 因此는 문어체에 자주 쓰임',
    examples:[
      {zh:'由于原材料涨价，我们不得不调整报价。',pinyin:'Yóuyú yuáncáiliào zhǎngjià, wǒmen bùdébù tiáozhěng bàojià.',kr:'원자재 가격 상승으로 인해 저희는 견적을 조정할 수밖에 없습니다.'},
      {zh:'因为运输延误，所以到货时间推迟了。',pinyin:'Yīnwèi yùnshū yánwù, suǒyǐ dàohuò shíjiān tuīchí le.',kr:'운송 지연으로 인해 도착 시간이 늦어졌습니다.'},
      {zh:'由于市场竞争激烈，因此价格难以提高。',pinyin:'Yóuyú shìchǎng jìngzhēng jīliè, yīncǐ jiàgé nányǐ tígāo.',kr:'시장 경쟁이 치열하여 가격을 올리기 어렵습니다.'},
    ]},
  { title:'목적: 为了/为…而…', pattern:'为了 + [목적] + [행동]', structure:'为了(~을 위하여) → 목적을 나타냄', category:'전치사구',
    examples:[
      {zh:'为了保证质量，我们增加了检测环节。',pinyin:'Wèile bǎozhèng zhìliàng, wǒmen zēngjiā le jiǎncè huánjié.',kr:'품질 보증을 위해 저희는 검사 단계를 추가했습니다.'},
      {zh:'为了降低成本，我们优化了生产流程。',pinyin:'Wèile jiàngdī chéngběn, wǒmen yōuhuà le shēngchǎn liúchéng.',kr:'비용 절감을 위해 저희는 생산 프로세스를 최적화했습니다.'},
      {zh:'为了扩大合作，我们愿意提供更好的条件。',pinyin:'Wèile kuòdà hézuò, wǒmen yuànyì tígōng gèng hǎo de tiáojiàn.',kr:'협력 확대를 위해 저희는 더 좋은 조건을 제공할 의향이 있습니다.'},
    ]},

  // ═══ 어기·강조 ═══════════════════════════════════════════════════════
  { title:'강조 부정: 根本不/从来不', pattern:'根本不/从来不 + [동사]', structure:'根本不(전혀 ~않다)/从来不(한 번도 ~않다) → 강한 부정', category:'강조부정',
    examples:[
      {zh:'这个价格我们根本不能接受。',pinyin:'Zhège jiàgé wǒmen gēnběn bù néng jiēshòu.',kr:'이 가격은 저희가 전혀 받아들일 수 없습니다.'},
      {zh:'我们从来不在质量上打折扣。',pinyin:'Wǒmen cónglái bù zài zhìliàng shàng dǎ zhékòu.',kr:'저희는 품질에 있어서 절대로 타협하지 않습니다.'},
      {zh:'这种情况我们从来没有遇到过。',pinyin:'Zhè zhǒng qíngkuàng wǒmen cónglái méiyǒu yùdào guò.',kr:'이런 상황을 저희는 한 번도 겪어본 적이 없습니다.'},
    ]},
  { title:'이중 부정(강한 긍정): 不得不', pattern:'不得不 + [동사]', structure:'不得不(~하지 않을 수 없다) → 어쩔 수 없이 해야 한다', category:'강조부정',
    examples:[
      {zh:'由于质量问题，我们不得不退货。',pinyin:'Yóuyú zhìliàng wèntí, wǒmen bùdébù tuìhuò.',kr:'품질 문제로 인해 저희는 반품하지 않을 수 없습니다.'},
      {zh:'成本上涨，我们不得不提价。',pinyin:'Chéngběn shàngzhǎng, wǒmen bùdébù tí jià.',kr:'비용이 상승해 저희는 가격을 올릴 수밖에 없습니다.'},
      {zh:'对方不守承诺，我们不得不终止合作。',pinyin:'Duìfāng bù shǒu chéngnuò, wǒmen bùdébù zhōngzhǐ hézuò.',kr:'상대방이 약속을 지키지 않아 저희는 협력을 중단할 수밖에 없습니다.'},
    ]},
  { title:'의문: 难道…吗?', pattern:'难道 + [진술] + 吗?', structure:'难道(설마~이란 말인가?) → 반문·강조 의문', category:'강조부정',
    examples:[
      {zh:'难道价格还要再提高吗？',pinyin:'Nándào jiàgé hái yào zài tígāo ma?',kr:'설마 가격을 또 올리겠다는 말입니까?'},
      {zh:'难道这个质量问题不需要解决吗？',pinyin:'Nándào zhège zhìliàng wèntí bù xūyào jiějué ma?',kr:'설마 이 품질 문제를 해결할 필요가 없다는 말입니까?'},
      {zh:'难道你没看到我们发的邮件吗？',pinyin:'Nándào nǐ méi kàndào wǒmen fā de yóujiàn ma?',kr:'설마 저희가 보낸 이메일을 보지 못했다는 말입니까?'},
    ]},

  // ═══ 비즈니스 이메일 표현 ═══════════════════════════════════════════
  { title:'이메일 시작: 您好/尊敬的', pattern:'您好！/ 尊敬的[이름]，', structure:'您好(안녕하세요)/尊敬的(존경하는) → 이메일 인사말', category:'이메일표현',
    notes:'尊敬的는 정식 문서/첫 연락에 사용. 熟知的关系엔 您好 또는 이름 직접 사용',
    examples:[
      {zh:'您好！感谢您上次的来访，希望这封邮件找到您一切安好。',pinyin:'Nín hǎo! Gǎnxiè nín shàng cì de láifǎng, xīwàng zhè fēng yóujiàn zhǎodào nín yīqiè ānhǎo.',kr:'안녕하세요! 지난번 방문에 감사드리며, 이 이메일이 귀하께 평안히 전달되길 바랍니다.'},
      {zh:'尊敬的金先生，非常感谢您对我们公司的关注。',pinyin:'Zūnjìng de Jīn xiānsheng, fēicháng gǎnxiè nín duì wǒmen gōngsī de guānzhù.',kr:'존경하는 김 씨, 저희 회사에 관심을 가져주셔서 대단히 감사합니다.'},
      {zh:'您好！就您上次询问的产品规格，现在给您回复如下。',pinyin:'Nín hǎo! Jiù nín shàng cì xúnwèn de chǎnpǐn guīgé, xiànzài gěi nín huífù rúxià.',kr:'안녕하세요! 지난번 문의하신 제품 사양에 대해 아래와 같이 회신드립니다.'},
    ]},
  { title:'이메일 본론 도입: 特此/现致函', pattern:'特此告知… / 现致函… / 就…事宜…', structure:'특정 사안을 알리는 정식 서한 표현', category:'이메일표현',
    examples:[
      {zh:'特此告知，我司已完成相关认证，请查收附件。',pinyin:'Tèci gàozhī, wǒ sī yǐ wánchéng xiāngguān rènzhèng, qǐng cháshōu fùjiàn.',kr:'이에 알려드리니, 저희 회사는 관련 인증을 완료했습니다. 첨부파일을 확인해주세요.'},
      {zh:'就产品价格事宜，现将最新报价单附上，请惠存。',pinyin:'Jiù chǎnpǐn jiàgé shìyí, xiàn jiāng zuìxīn bàojià dān fùshàng, qǐng huì cún.',kr:'제품 가격 건과 관련하여 최신 견적서를 첨부드리오니 보관해주시기 바랍니다.'},
      {zh:'现致函贵公司，希望就合作事宜进行进一步洽谈。',pinyin:'Xiàn zhì hán guì gōngsī, xīwàng jiù hézuò shìyí jìnxíng jìnyī bù qiàtán.',kr:'귀사에 서한을 드리며, 협력 사안에 대해 추가 협의하길 바랍니다.'},
    ]},
  { title:'이메일 마무리: 请惠复/期待回音', pattern:'期待您的回复！/ 请惠复。/ 如有疑问，请随时联系。', structure:'이메일 마무리 표현. 회신 요청과 연락처 안내', category:'이메일표현',
    examples:[
      {zh:'如有任何疑问，请随时与我联系，期待您的回复！',pinyin:'Rú yǒu rènhé yíwèn, qǐng suíshí yǔ wǒ liánxì, qīdài nín de huífù!',kr:'궁금한 점이 있으시면 언제든지 연락주시고, 회신을 기다립니다!'},
      {zh:'烦请惠复，以便我们尽快安排后续事宜。',pinyin:'Fán qǐng huì fù, yǐbiàn wǒmen jǐnkuài ānpái hòuxù shìyí.',kr:'회신해주시면 저희가 빨리 후속 사안을 배치하겠습니다.'},
      {zh:'衷心期待与贵公司的进一步合作，祝商祺！',pinyin:'Zhōngxīn qīdài yǔ guì gōngsī de jìnyībù hézuò, zhù shāng qí!',kr:'귀사와의 추가 협력을 진심으로 기대하며, 사업 번창하시길 바랍니다!'},
    ]},
  { title:'첨부파일 안내', pattern:'附上… / 请查收附件… / 详见附件…', structure:'이메일 첨부파일 안내 표현', category:'이메일표현',
    examples:[
      {zh:'请查收附件中的产品目录和报价单。',pinyin:'Qǐng cháshōu fùjiàn zhōng de chǎnpǐn mùlù hé bàojià dān.',kr:'첨부파일의 제품 카탈로그와 견적서를 확인해주세요.'},
      {zh:'详细规格见附件，如需修改请告知。',pinyin:'Xiángxì guīgé jiàn fùjiàn, rú xū xiūgǎi qǐng gào zhī.',kr:'상세 사양은 첨부파일 참고, 수정이 필요하면 알려주세요.'},
      {zh:'随函附上合同草稿，请惠阅后签字盖章。',pinyin:'Suí hán fùshàng hétong cǎogǎo, qǐng huì yuè hòu qiānzì gài zhāng.',kr:'서한과 함께 계약서 초안을 첨부드리니, 검토 후 서명 날인해주세요.'},
    ]},

  // ═══ 공문서·격식 표현 ═══════════════════════════════════════════════
  { title:'정중한 부탁: 烦请/劳驾/麻烦您', pattern:'烦请/劳驾/麻烦您 + [동사구]', structure:'烦请(수고스럽지만)/劳驾(실례합니다)/麻烦您(번거롭게 해드려서) → 정중한 의뢰', category:'공문서격식',
    examples:[
      {zh:'烦请贵方尽快安排出货。',pinyin:'Fán qǐng guì fāng jǐnkuài ānpái chūhuò.',kr:'수고스럽지만 귀측에서 빨리 출하를 배치해주시길 바랍니다.'},
      {zh:'劳驾您帮忙确认一下到货时间。',pinyin:'Láojià nín bāngmáng quèrèn yīxià dàohuò shíjiān.',kr:'실례지만 도착 시간을 확인해주시겠습니까?'},
      {zh:'麻烦您修改合同第三条款。',pinyin:'Máfan nín xiūgǎi hétong dì sān tiáokuǎn.',kr:'번거롭게도 계약서 3조를 수정해주시길 바랍니다.'},
    ]},
  { title:'정중한 수락/거절', pattern:'我方同意… / 我方遗憾地表示…', structure:'公文式(공문서식) 동의 및 거절 표현', category:'공문서격식',
    examples:[
      {zh:'我方同意贵方提出的修改意见，将在三天内发出新版合同。',pinyin:'Wǒ fāng tóngyì guì fāng tíchū de xiūgǎi yìjiàn, jiāng zài sān tiān nèi fā chū xīn bǎn hétong.',kr:'저희는 귀측의 수정 의견에 동의하며, 3일 내에 새 버전 계약서를 발송하겠습니다.'},
      {zh:'我方遗憾地表示无法接受此价格，恳请贵方重新考虑。',pinyin:'Wǒ fāng yíhàn de biǎoshì wúfǎ jiēshòu cǐ jiàgé, kěn qǐng guì fāng chóngxīn kǎolǜ.',kr:'저희는 유감스럽게도 이 가격을 받아들일 수 없으며, 귀측의 재고를 간청드립니다.'},
      {zh:'经研究，我方认为该方案可行，同意试行三个月。',pinyin:'Jīng yánjīu, wǒ fāng rènwéi gāi fāng\'àn kěxíng, tóngyì shì xíng sān gè yuè.',kr:'검토 결과 저희는 이 방안이 실행 가능하다고 판단하여 3개월 시범 운영에 동의합니다.'},
    ]},
  { title:'회사 소개 격식 표현', pattern:'本公司成立于… 主营… 拥有…', structure:'我司/本公司 + 성립연도 + 주요사업 + 규모 소개', category:'공문서격식',
    examples:[
      {zh:'本公司成立于2010年，主营LED照明产品的研发和出口。',pinyin:'Běn gōngsī chénglì yú 2010 nián, zhǔ yíng LED zhàomíng chǎnpǐn de yánfā hé chūkǒu.',kr:'본사는 2010년에 설립됐으며, 주로 LED조명 제품의 연구개발과 수출을 합니다.'},
      {zh:'我司拥有员工500余名，年产值突破一亿元人民币。',pinyin:'Wǒ sī yōngyǒu yuángōng 500 yú míng, nián chǎnzhí tūpò yī yì yuán Rénmínbì.',kr:'저희 회사는 직원 500명 이상이며, 연 생산액은 1억 위안을 돌파합니다.'},
      {zh:'我司持有ISO9001质量管理体系认证，产品远销全球60个国家。',pinyin:'Wǒ sī chí yǒu ISO9001 zhìliàng guǎnlǐ tǐxì rènzhèng, chǎnpǐn yuǎn xiāo quánqiú 60 gè guójiā.',kr:'저희 회사는 ISO9001 품질관리시스템 인증을 보유하며, 전 세계 60개국에 수출합니다.'},
    ]},

  // ═══ 수량·숫자 표현 ══════════════════════════════════════════════════
  { title:'수량 표현: 数量词+양사+명사', pattern:'[숫자] + [양사] + [명사]', structure:'중국어는 숫자와 명사 사이에 반드시 양사(量词) 필요', category:'수량표현',
    notes:'个(일반), 只(동물/등기구류), 件(옷/사건), 张(평평한 것), 本(책), 台(기계), 辆(차량)',
    examples:[
      {zh:'我们需要一百只LED灯。',pinyin:'Wǒmen xūyào yī bǎi zhī LED dēng.',kr:'저희는 LED등 100개가 필요합니다.'},
      {zh:'请寄三份合同样本。',pinyin:'Qǐng jì sān fèn hétong yàngběn.',kr:'계약서 샘플 3부를 보내주세요.'},
      {zh:'我们订了两台检测设备。',pinyin:'Wǒmen dìng le liǎng tái jiǎncè shèbèi.',kr:'저희는 검사 장비 2대를 주문했습니다.'},
    ]},
  { title:'대략적 수량: 大约/左右/约', pattern:'大约/约 + [숫자] + [양사] + [명사] / [숫자] + [양사] + 左右', structure:'大约/约(약)/左右(전후) → 대략적인 수량 표현', category:'수량표현',
    examples:[
      {zh:'大约需要两周时间完成生产。',pinyin:'Dàyuē xūyào liǎng zhōu shíjiān wánchéng shēngchǎn.',kr:'생산 완료에 약 2주가 필요합니다.'},
      {zh:'订单金额约十万美元左右。',pinyin:'Dìngdān jīn\'é yuē shí wàn Měiyuán zuǒyòu.',kr:'주문 금액이 약 10만 달러 전후입니다.'},
      {zh:'交货期大约在45天左右。',pinyin:'Jiāohuò qī dàyuē zài 45 tiān zuǒyòu.',kr:'납기는 약 45일 전후입니다.'},
    ]},

  // ═══ 고급 표현 ═══════════════════════════════════════════════════════
  { title:'점층 표현: 不仅…而且/甚至…', pattern:'不仅 + A + 而且/甚至 + B', structure:'不仅(~뿐만 아니라)+而且(게다가)/甚至(심지어)', category:'고급표현',
    examples:[
      {zh:'我们不仅提供产品，而且提供完整的解决方案。',pinyin:'Wǒmen bùjǐn tígōng chǎnpǐn, érqiě tígōng wánzhěng de jiějué fāng\'àn.',kr:'저희는 제품뿐만 아니라 완전한 솔루션도 제공합니다.'},
      {zh:'这款产品不仅节能，甚至达到了零碳排放标准。',pinyin:'Zhè kuǎn chǎnpǐn bùjǐn jiénéng, shènzhì dádào le líng tàn páifàng biāozhǔn.',kr:'이 제품은 에너지를 절약할 뿐만 아니라 심지어 탄소 제로 배출 기준에 도달했습니다.'},
      {zh:'合作不仅带来了经济效益，而且提升了双方品牌影响力。',pinyin:'Hézuò bùjǐn dài lái le jīngjì xiàoyì, érqiě tíshēng le shuāngfāng pǐnpái yǐngxiǎnglì.',kr:'협력은 경제적 이익을 가져올 뿐만 아니라 양측 브랜드 영향력도 높였습니다.'},
    ]},
  { title:'선택 의문: 是A还是B', pattern:'是 + A + 还是 + B + ?', structure:'A냐 B냐 선택을 묻는 의문문', category:'고급표현',
    examples:[
      {zh:'您是用T/T付款还是用L/C？',pinyin:'Nín shì yòng T/T fùkuǎn háishì yòng L/C?',kr:'T/T로 결제하십니까, 아니면 L/C로 하십니까?'},
      {zh:'是整批发货还是分批？',pinyin:'Shì zhěng pī fāhuò háishì fēn pī?',kr:'일괄 발송입니까, 아니면 분할 발송입니까?'},
      {zh:'出货港是上海还是宁波？',pinyin:'Chūhuò gǎng shì Shànghǎi háishì Níngbō?',kr:'선적항이 상하이입니까, 아니면 닝보입니까?'},
    ]},
  { title:'열거: 一方面…另一方面…', pattern:'一方面 + A + 另一方面 + B', structure:'一方面(한편으로는)+另一方面(다른 한편으로는) → 양면을 설명', category:'고급표현',
    examples:[
      {zh:'一方面，我们要保证质量；另一方面，也要控制成本。',pinyin:'Yī fāngmiàn, wǒmen yào bǎozhèng zhìliàng; lìng yī fāngmiàn, yě yào kòngzhì chéngběn.',kr:'한편으로는 품질을 보증해야 하고, 다른 한편으로는 비용도 통제해야 합니다.'},
      {zh:'一方面希望尽快发货，另一方面也不能忽视质量检测。',pinyin:'Yī fāngmiàn xīwàng jǐnkuài fāhuò, lìng yī fāngmiàn yě bù néng hūshì zhìliàng jiǎncè.',kr:'한편으로는 빨리 발송하길 원하지만, 다른 한편으로는 품질 검사를 소홀히 할 수 없습니다.'},
      {zh:'一方面感谢贵方配合，另一方面也请理解我们的立场。',pinyin:'Yī fāngmiàn gǎnxiè guì fāng pèihé, lìng yī fāngmiàn yě qǐng lǐjiě wǒmen de lìchǎng.',kr:'한편으로는 귀측의 협조에 감사하며, 다른 한편으로는 저희 입장도 이해해주시기 바랍니다.'},
    ]},
  { title:'총괄 결론: 总的来说/综上所述', pattern:'总的来说… / 综上所述，我方认为…', structure:'总的来说(전체적으로 말하면)/综上所述(위를 종합하면) → 결론 도출', category:'고급표현',
    examples:[
      {zh:'总的来说，我们对这次合作非常满意。',pinyin:'Zǒng de lái shuō, wǒmen duì zhè cì hézuò fēicháng mǎnyì.',kr:'전체적으로 말하면, 저희는 이번 협력에 매우 만족합니다.'},
      {zh:'综上所述，我方建议将合同期限延长至三年。',pinyin:'Zōng shàng suǒ shù, wǒ fāng jiànyì jiāng hétong qīxiàn yán cháng zhì sān nián.',kr:'위를 종합하면, 저희는 계약 기간을 3년으로 연장할 것을 제안합니다.'},
      {zh:'总而言之，双方合作基础良好，前景光明。',pinyin:'Zǒng\'ér yán zhī, shuāngfāng hézuò jīchǔ liánghǎo, qiánjǐng guāngmíng.',kr:'총괄하면, 양측 협력 기반이 양호하고 전망이 밝습니다.'},
    ]},
  { title:'전환: 话虽如此…但是…', pattern:'话虽如此，但是…', structure:'话虽如此(그렇긴 하지만) → 앞 내용을 인정하면서 반전', category:'고급표현',
    examples:[
      {zh:'话虽如此，但价格确实需要再讨论一下。',pinyin:'Huà suī rúcǐ, dàn jiàgé quèshí xūyào zài tǎolùn yīxià.',kr:'그렇긴 하지만, 가격은 확실히 다시 논의할 필요가 있습니다.'},
      {zh:'话虽如此，质量问题还是需要有人负责。',pinyin:'Huà suī rúcǐ, zhìliàng wèntí háishì xūyào yǒu rén fùzé.',kr:'그렇긴 하지만, 품질 문제는 여전히 누군가 책임져야 합니다.'},
      {zh:'话虽如此，我们仍然希望双方能找到共同点。',pinyin:'Huà suī rúcǐ, wǒmen réngrán xīwàng shuāngfāng néng zhǎodào gòngtóngdiǎn.',kr:'그렇긴 하지만, 저희는 여전히 양측이 공통점을 찾을 수 있길 바랍니다.'},
    ]},

  // ═══ 회화 필수 표현 ═══════════════════════════════════════════════════
  { title:'확인 요청: 您的意思是说…?', pattern:'您的意思是说 + [재확인 내용] + 吗?', structure:'상대방 말을 재확인할 때. 의사소통 오해 방지', category:'회화필수',
    examples:[
      {zh:'您的意思是说，这个价格可以再降一点？',pinyin:'Nín de yìsi shì shuō, zhège jiàgé kěyǐ zài jiàng yīdiǎn?',kr:'가격을 조금 더 내릴 수 있다는 말씀이신가요?'},
      {zh:'您的意思是说，需要我们先付30%定金？',pinyin:'Nín de yìsi shì shuō, xūyào wǒmen xiān fù 30% dìngjīn?',kr:'저희가 먼저 계약금 30%를 납부해야 한다는 말씀이신가요?'},
      {zh:'您的意思是说，交货期可以提前到40天？',pinyin:'Nín de yìsi shì shuō, jiāohuò qī kěyǐ tíqián dào 40 tiān?',kr:'납기를 40일로 앞당길 수 있다는 말씀이신가요?'},
    ]},
  { title:'시간 벌기: 这个问题我需要确认一下', pattern:'这个问题我需要确认一下，稍后给您回复。', structure:'즉답을 피하고 시간을 벌 때 쓰는 표현', category:'회화필수',
    examples:[
      {zh:'这个问题我需要跟上级确认一下，明天给您回复。',pinyin:'Zhège wèntí wǒ xūyào gēn shàngjí quèrèn yīxià, míngtiān gěi nín huífù.',kr:'이 문제는 상사에게 확인이 필요해서, 내일 회신드리겠습니다.'},
      {zh:'价格方面让我跟财务核实一下，最迟今天下午给您消息。',pinyin:'Jiàgé fāngmiàn ràng wǒ gēn cáiwù héshí yīxià, zuì chí jīntiān xiàwǔ gěi nín xiāoxi.',kr:'가격 부분은 재무팀에 확인하겠습니다. 늦어도 오늘 오후에 연락드리겠습니다.'},
      {zh:'请允许我们内部讨论后再做回应，大约需要两天时间。',pinyin:'Qǐng yǔnxǔ wǒmen nèibù tǎolùn hòu zài zuò huíyìng, dàyuē xūyào liǎng tiān shíjiān.',kr:'내부 논의 후 답변드리겠습니다. 약 이틀이 필요합니다.'},
    ]},
  { title:'의견 제시: 我建议/我认为', pattern:'我建议… / 我认为… / 在我看来…', structure:'자신의 의견이나 제안을 공손하게 표현', category:'회화필수',
    examples:[
      {zh:'我建议我们先从小批量开始合作，相互了解后再扩大。',pinyin:'Wǒ jiànyì wǒmen xiān cóng xiǎo pīliàng kāishǐ hézuò, xiānghù liǎojiě hòu zài kuòdà.',kr:'저는 먼저 소량으로 협력을 시작한 후 서로 파악하고 나서 확대할 것을 제안합니다.'},
      {zh:'我认为这个价格已经非常合理了，希望贵方认真考虑。',pinyin:'Wǒ rènwéi zhège jiàgé yǐjīng fēicháng hélǐ le, xīwàng guì fāng rènzhēn kǎolǜ.',kr:'저는 이 가격이 이미 매우 합리적이라 생각하며, 귀측이 진지하게 고려해주시길 바랍니다.'},
      {zh:'在我看来，双方合作的基础非常好，值得长期合作。',pinyin:'Zài wǒ kàn lái, shuāngfāng hézuò de jīchǔ fēicháng hǎo, zhídé cháng qī hézuò.',kr:'제가 보기에 양측 협력의 기반이 매우 좋아, 장기 협력할 가치가 있습니다.'},
    ]},
  { title:'완곡한 거절: 这个恐怕不太方便', pattern:'这个恐怕… / 这个…有点困难 / 这个不太好办', structure:'직접 거절 대신 완곡하게 표현하는 방법', category:'회화필수',
    notes:'중국어에서 직접적인 No는 무례할 수 있어 完曲表现(완곡한 표현)을 자주 씀',
    examples:[
      {zh:'这个价格，恐怕我们这边有点困难。',pinyin:'Zhège jiàgé, kǒngpà wǒmen zhèbiān yǒudiǎn kùnnán.',kr:'이 가격은 저희 쪽에서 좀 어렵습니다.'},
      {zh:'这个条款恐怕不太好接受，能不能再商量一下？',pinyin:'Zhège tiáokuǎn kǒngpà bù tài hǎo jiēshòu, néng bu néng zài shāngliang yīxià?',kr:'이 조항은 받아들이기 좀 어렵습니다, 다시 협의할 수 있을까요?'},
      {zh:'这么短的交货期，这个……有点不好办啊。',pinyin:'Zhème duǎn de jiāohuò qī, zhège…… yǒudiǎn bù hǎo bàn a.',kr:'이렇게 짧은 납기는 좀 처리하기 어렵습니다.'},
    ]},
  { title:'동의 표达: 说得对/没错/正是', pattern:'说得对！/ 没错！/ 正是如此。/ 完全同意。', structure:'상대방 말에 적극적으로 동의할 때', category:'회화필수',
    examples:[
      {zh:'说得对，质量和价格同样重要。',pinyin:'Shuō de duì, zhìliàng hé jiàgé tóngyàng zhòngyào.',kr:'맞습니다, 품질과 가격이 똑같이 중요합니다.'},
      {zh:'没错，我们也希望能建立长期稳定的合作关系。',pinyin:'Méicuò, wǒmen yě xīwàng néng jiànlì cháng qī wěndìng de hézuò guānxi.',kr:'맞아요, 저희도 장기적으로 안정적인 협력 관계를 구축하길 원합니다.'},
      {zh:'完全同意！互利共赢才是我们合作的基础。',pinyin:'Wánquán tóngyì! Hùlì gòngyíng cái shì wǒmen hézuò de jīchǔ.',kr:'완전히 동의합니다! 상호이익이야말로 저희 협력의 기반입니다.'},
    ]},

  // ═══ 중국 비즈니스 문화 표현 ══════════════════════════════════════
  { title:'건배 표현: 干杯/为…干杯', pattern:'为 + [주제] + 干杯！', structure:'건배 제의. 중국식 술자리에서 필수 표현', category:'비즈니스문화',
    notes:'一口闷(원샷), 随意(편한 대로), 我以茶代酒(차로 대신하겠습니다) 알아두기',
    examples:[
      {zh:'为我们双方的合作干杯！',pinyin:'Wèi wǒmen shuāngfāng de hézuò gānbēi!',kr:'양측의 협력을 위해 건배!'},
      {zh:'为我们的友谊和未来干杯！',pinyin:'Wèi wǒmen de yǒuyì hé wèilái gānbēi!',kr:'우리의 우정과 미래를 위해 건배!'},
      {zh:'我不太能喝酒，以茶代酒，干杯！',pinyin:'Wǒ bù tài néng hē jiǔ, yǐ chá dài jiǔ, gānbēi!',kr:'저는 술을 잘 못해서 차로 대신하겠습니다, 건배!'},
    ]},
  { title:'명함 교환: 这是我的名片', pattern:'这是我的名片，请多关照。', structure:'명함 교환 시 표현. 두 손으로 주고받는 것이 예의', category:'비즈니스문화',
    notes:'명함을 받으면 바로 넣지 말고 잠시 읽어보는 것이 예의',
    examples:[
      {zh:'这是我的名片，请多关照！',pinyin:'Zhè shì wǒ de míngpiàn, qǐng duō guānzhào!',kr:'제 명함입니다, 잘 부탁드립니다!'},
      {zh:'您的名片能给我一张吗？',pinyin:'Nín de míngpiàn néng gěi wǒ yī zhāng ma?',kr:'명함 한 장 주시겠습니까?'},
      {zh:'很荣幸认识您，这是我的联系方式。',pinyin:'Hěn róngxìng rènshi nín, zhè shì wǒ de liánxì fāngshì.',kr:'만나서 영광입니다. 제 연락처입니다.'},
    ]},
  { title:'접대 응용: 您请坐/请用茶', pattern:'您请坐！/ 请用茶！/ 请多吃！', structure:'손님 접대 시 기본 표현', category:'비즈니스문화',
    examples:[
      {zh:'您请坐，不用客气！',pinyin:'Nín qǐng zuò, bùyòng kèqi!',kr:'앉으세요, 편히 하세요!'},
      {zh:'请用茶，这是我们当地的名茶。',pinyin:'Qǐng yòng chá, zhè shì wǒmen dāngdì de míng chá.',kr:'차 드세요, 이것이 저희 현지 명차입니다.'},
      {zh:'今天请您尝尝广东的特色菜，请多用！',pinyin:'Jīntiān qǐng nín cháng cháng Guǎngdōng de tèsè cài, qǐng duō yòng!',kr:'오늘 광동 특색 요리를 맛보세요, 많이 드세요!'},
    ]},
];

export const GRAMMAR_CATEGORIES = [
  '전체', '기본구조', '가격협상', '납기생산', '품질검사',
  '결제송금', '이메일소통', '회의', '사과감사', '부탁요청',
  '파트너십', '클레임',
  '시제표현', '비교문', '조건가정', '수동피동', '보어',
  '전치사구', '강조부정', '이메일표현', '공문서격식',
  '수량표현', '고급표현', '회화필수', '비즈니스문화',
];
