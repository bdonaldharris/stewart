import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { StewardshipReportData } from "../model/events";
import { createStewardshipReportPdfContent } from "./stewardshipReportPdfContent";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingRight: 48,
    paddingBottom: 52,
    paddingLeft: 48,
    color: "#16211c",
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomColor: "#a9d2c6",
    borderBottomWidth: 1,
    paddingBottom: 14,
    marginBottom: 20,
  },
  title: {
    color: "#0a4f47",
    fontFamily: "Times-Roman",
    fontSize: 24,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    color: "#e4f1ec",
    fontFamily: "Times-Roman",
    fontSize: 16,
    textAlign: "center",
    paddingTop: 4,
    backgroundColor: "#0a4f47",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    marginBottom: 8,
    color: "#0a4f47",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.15,
    textTransform: "uppercase",
  },
  assessment: {
    borderTopColor: "#d9e2dc",
    borderTopWidth: 1,
    borderBottomColor: "#d9e2dc",
    borderBottomWidth: 1,
    paddingVertical: 13,
  },
  assessmentCopy: {
    fontFamily: "Times-Roman",
    fontSize: 13,
    lineHeight: 1.55,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 5,
  },
  bullet: {
    width: 12,
    color: "#0a4f47",
  },
  listText: {
    flex: 1,
  },
  option: {
    borderColor: "#d9e2dc",
    borderWidth: 1,
    borderRadius: 5,
    padding: 12,
    marginBottom: 10,
  },
  optionHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  optionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    color: "#e4f1ec",
    fontSize: 8,
    textAlign: "center",
    paddingTop: 6,
    backgroundColor: "#0a4f47",
  },
  optionTitle: {
    flex: 1,
    marginLeft: 8,
    fontFamily: "Times-Roman",
    fontSize: 13,
  },
  optionDescription: {
    marginBottom: 10,
    color: "#5d6a63",
  },
  optionColumns: {
    flexDirection: "row",
    gap: 16,
  },
  optionColumn: {
    flex: 1,
  },
  optionLabel: {
    marginBottom: 5,
    color: "#0a4f47",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  optionListItem: {
    flexDirection: "row",
    marginBottom: 4,
  },
  optionMarker: {
    width: 10,
    color: "#0a4f47",
  },
});

function BulletList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.listItem}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function OptionList({ items, marker }: { items: string[]; marker: string }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.optionListItem}>
          <Text style={styles.optionMarker}>{marker}</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function StewardshipReportPdf({ report }: { report: StewardshipReportData }) {
  const content = createStewardshipReportPdfContent(report);

  return (
    <Document title="Stewardship Report" author="Stewart">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Stewardship Report</Text>
          <Text style={styles.mark}>S</Text>
        </View>

        <View style={[styles.section, styles.assessment]}>
          <Text style={styles.sectionTitle}>Stewart&apos;s Assessment</Text>
          <Text style={styles.assessmentCopy}>{content.assessment}</Text>
        </View>

        {content.sections.map((section) => (
          <View key={section.title} style={styles.section} minPresenceAhead={60}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <BulletList items={section.items} />
          </View>
        ))}

        {content.options.length > 0 && (
          <View style={styles.section} minPresenceAhead={90}>
            <Text style={styles.sectionTitle}>Options &amp; Tradeoffs</Text>
            {content.options.map((option, index) => (
              <View key={`${option.title}-${index}`} style={styles.option} minPresenceAhead={80}>
                <View style={styles.optionHeading}>
                  <Text style={styles.optionNumber}>{String(index + 1).padStart(2, "0")}</Text>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                </View>
                {option.description && (
                  <Text style={styles.optionDescription}>{option.description}</Text>
                )}
                <View style={styles.optionColumns}>
                  <View style={styles.optionColumn}>
                    <Text style={styles.optionLabel}>Benefits</Text>
                    <OptionList items={option.benefits} marker="+" />
                  </View>
                  <View style={styles.optionColumn}>
                    <Text style={styles.optionLabel}>Tradeoffs</Text>
                    <OptionList items={option.tradeoffs} marker="-" />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
