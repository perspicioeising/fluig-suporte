import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseWsdl } from "@/modules/soap/wsdl-parser";
import { buildSoapEnvelope, inspectEnvelope, parseSoapFault } from "@/modules/soap/envelope";

// WSDL mínimo document/literal wrapped no estilo dos serviços ECM do Fluig.
const WSDL = `<?xml version="1.0"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://ws.foundation.ecm.technology.totvs.com/" xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://ws.foundation.ecm.technology.totvs.com/" name="ECMColleagueServiceService">
  <types>
    <xsd:schema targetNamespace="http://ws.foundation.ecm.technology.totvs.com/" elementFormDefault="unqualified">
      <xsd:element name="getColleague" type="tns:getColleague"/>
      <xsd:element name="getColleagueResponse" type="tns:getColleagueResponse"/>
      <xsd:complexType name="getColleague">
        <xsd:sequence>
          <xsd:element name="username" type="xsd:string" minOccurs="0"/>
          <xsd:element name="password" type="xsd:string" minOccurs="0"/>
          <xsd:element name="companyId" type="xsd:int"/>
          <xsd:element name="colleagueId" type="xsd:string" minOccurs="0"/>
        </xsd:sequence>
      </xsd:complexType>
      <xsd:complexType name="getColleagueResponse">
        <xsd:sequence><xsd:element name="result" type="xsd:string" minOccurs="0"/></xsd:sequence>
      </xsd:complexType>
    </xsd:schema>
  </types>
  <message name="getColleague"><part name="parameters" element="tns:getColleague"/></message>
  <message name="getColleagueResponse"><part name="parameters" element="tns:getColleagueResponse"/></message>
  <portType name="ColleagueService">
    <operation name="getColleague"><input message="tns:getColleague"/><output message="tns:getColleagueResponse"/></operation>
  </portType>
  <binding name="ColleagueServicePortBinding" type="tns:ColleagueService">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <operation name="getColleague">
      <soap:operation soapAction=""/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>
  <service name="ECMColleagueServiceService">
    <port name="ColleagueServicePort" binding="tns:ColleagueServicePortBinding">
      <soap:address location="http://servidor-interno:8080/webdesk/ECMColleagueService"/>
    </port>
  </service>
</definitions>`;

describe("WSDL", () => {
  const parsed = parseWsdl([WSDL]);
  const op = parsed.operations.find((o) => o.name === "getColleague");

  test("extrai a operação com estilo, versão e endpoint", () => {
    assert.ok(op, "operação não encontrada");
    assert.equal(op.style, "document");
    assert.equal(op.soapVersion, "1.1");
    assert.equal(op.service, "ECMColleagueServiceService");
    assert.equal(op.endpoint, "http://servidor-interno:8080/webdesk/ECMColleagueService");
    assert.equal(op.input.wrapper?.name, "getColleague");
    assert.deepEqual(op.input.params.map((p) => p.name), ["username", "password", "companyId", "colleagueId"]);
    assert.equal(op.input.params[2].minOccurs, 1);
  });

  test("gera envelope válido com os valores informados", () => {
    assert.ok(op);
    const xml = buildSoapEnvelope(op, { companyId: "2", colleagueId: "joao" });
    const info = inspectEnvelope(xml);
    assert.ok(info.ok, info.ok ? "" : info.error);
    assert.equal(info.bodyElement, "getColleague");
    assert.match(xml, /<companyId>2<\/companyId>/);
    assert.match(xml, /<colleagueId>joao<\/colleagueId>/);
    assert.match(xml, /<!--Opcional-->/);
  });
});

describe("envelope", () => {
  test("inspectEnvelope recusa XML inválido ou sem Body", () => {
    assert.equal(inspectEnvelope("<a><b></a>").ok, false);
    assert.equal(inspectEnvelope("<x/>").ok, false);
    assert.equal(
      inspectEnvelope('<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body/></soapenv:Envelope>').ok,
      false,
    );
  });

  test("parseSoapFault lê SOAP 1.1 e 1.2", () => {
    const f11 = parseSoapFault(
      '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault><faultcode>S:Server</faultcode><faultstring>Usuário inválido</faultstring></S:Fault></S:Body></S:Envelope>',
    );
    assert.deepEqual(f11, { code: "S:Server", message: "Usuário inválido", detail: undefined });

    const f12 = parseSoapFault(
      '<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body><env:Fault><env:Code><env:Value>env:Sender</env:Value></env:Code><env:Reason><env:Text>Erro</env:Text></env:Reason></env:Fault></env:Body></env:Envelope>',
    );
    assert.equal(f12?.code, "env:Sender");
    assert.equal(f12?.message, "Erro");
    assert.equal(parseSoapFault("<ok/>"), null);
  });
});
