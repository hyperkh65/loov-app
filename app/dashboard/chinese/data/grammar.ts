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
];

export const GRAMMAR_CATEGORIES = [
  '전체', '기본구조', '가격협상', '납기생산', '품질검사',
  '결제송금', '이메일소통', '회의', '사과감사', '부탁요청',
  '파트너십', '클레임',
];
